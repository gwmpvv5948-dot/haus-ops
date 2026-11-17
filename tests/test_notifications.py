"""Backend transport and configuration tests with a small HA service harness."""
import asyncio
import importlib.util
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest import IsolatedAsyncioTestCase, TestCase, mock
import sys

import voluptuous as vol

ROOT = Path(__file__).parents[1] / 'custom_components/haus_ops'
modules = {name: ModuleType(name) for name in (
    'homeassistant', 'homeassistant.components', 'homeassistant.components.websocket_api',
    'homeassistant.const', 'homeassistant.core', 'homeassistant.helpers',
    'homeassistant.helpers.event', 'homeassistant.helpers.storage', 'haus_ops_test')}
modules['haus_ops_test'].__path__ = [str(ROOT)]
ws = modules['homeassistant.components.websocket_api']
ws.websocket_command = lambda schema: lambda handler: handler
ws.async_response = lambda handler: handler
modules['homeassistant.const'].EVENT_HOMEASSISTANT_STARTED = 'start'
modules['homeassistant.const'].EVENT_STATE_CHANGED = 'state'
modules['homeassistant.core'].callback = lambda handler: handler
modules['homeassistant.helpers.event'].async_track_time_interval = mock.Mock()


class MemoryStore:
    def __init__(self, *args): self.value = None
    async def async_load(self): return self.value
    async def async_save(self, value): self.value = value


modules['homeassistant.helpers.storage'].Store = MemoryStore
with mock.patch.dict(sys.modules, modules):
    spec = importlib.util.spec_from_file_location('haus_ops_test.notifications', ROOT / 'notifications.py')
    backend = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = backend
    spec.loader.exec_module(backend)


class SchemaTests(TestCase):
    def test_disabled_by_default(self):
        config = backend.CONFIG({})
        self.assertEqual(config['yellow']['recipients'], [])
        self.assertEqual(config['red']['repeat_seconds'], 0)
        self.assertFalse(config['red']['critical'])

    def test_only_mobile_services(self):
        with self.assertRaises(vol.Invalid):
            backend.CONFIG({'red':{'recipients':['persistent_notification']}})

    def test_repetition_limits(self):
        for interval in [-1, 1, 29, 3601]:
            with self.assertRaises(vol.Invalid):
                backend.CONFIG({'red':{'repeat_seconds':interval}})


class SenderTests(IsolatedAsyncioTestCase):
    def sender(self, failure=False):
        from datetime import datetime, timezone
        states = {'alert.test':SimpleNamespace(entity_id='alert.test',state='on',attributes={'friendly_name':'Warnung'},last_changed=datetime(2026,11,17,tzinfo=timezone.utc))}
        async def notify(domain, service, payload, blocking):
            if failure and service == 'mobile_app_failed': raise RuntimeError('offline')
        services = SimpleNamespace(has_service=lambda domain,name:True, async_call=mock.AsyncMock(side_effect=notify))
        hass = SimpleNamespace(states=states, services=services)
        sender = backend.AlarmNotifications(hass, {'yellow_alerts':['alert.test'], 'yellow':{'recipients':['mobile_app_iphone']}})
        return sender, hass

    async def test_one_delivery_and_dedup(self):
        sender,hass=self.sender()
        await sender.deliver()
        await sender.deliver()
        self.assertEqual(hass.services.async_call.await_count,1)
        args=hass.services.async_call.call_args.args
        self.assertEqual(args[:2],('notify','mobile_app_iphone'))
        self.assertEqual(args[2]['message'],'Warnung')
        self.assertIsNotNone(sender.store.value)

    async def test_acknowledgement_stops_repetition(self):
        sender,hass=self.sender()
        sender.config['yellow']['repeat_seconds']=30
        await sender.deliver()
        for record in sender.sent.values(): record['time']=0
        hass.states['alert.test'].state='off'
        await sender.deliver()
        self.assertEqual(hass.services.async_call.await_count,1)

    async def test_failed_recipient_does_not_block_iphone(self):
        sender,hass=self.sender(failure=True)
        sender.config['yellow']['recipients']=['mobile_app_failed','mobile_app_iphone']
        with self.assertLogs(backend._LOGGER, level='ERROR'):
            await sender.deliver()
        self.assertEqual(hass.services.async_call.await_count,2)
        self.assertNotIn('alert.test|mobile_app_failed',sender.sent)
        self.assertIn('alert.test|mobile_app_iphone',sender.sent)

    async def test_red_critical_is_opt_in(self):
        sender,hass=self.sender()
        sender.config['yellow_alerts']=[]
        sender.config['red_alerts']=['alert.test']
        sender.config['red']={'recipients':['mobile_app_iphone'],'repeat_seconds':0,'critical':True}
        await sender.deliver()
        payload=hass.services.async_call.call_args.args[2]
        self.assertEqual(payload['data']['push']['sound']['critical'],1)
        self.assertEqual(payload['title'],'Roter Alarm')

    async def test_resolved_alarm_removes_delivery_history(self):
        sender,hass=self.sender()
        await sender.deliver()
        hass.states['alert.test'].state='idle'
        await sender.deliver()
        self.assertEqual(sender.sent,{})
