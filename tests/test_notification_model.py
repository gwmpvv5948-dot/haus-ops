"""Delivery tests without a running Home Assistant instance."""
import importlib.util
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('notification_model', Path(__file__).parents[1] / 'custom_components/haus_ops/notification_model.py')
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)


def state(entity_id, value, **attributes):
    return SimpleNamespace(entity_id=entity_id, state=value, attributes=attributes,
                           last_changed=datetime(2026, 11, 17, tzinfo=timezone.utc))


class DeliveryTests(unittest.TestCase):
    def test_first_alarm(self):
        self.assertTrue(model.delivery_due(None, 'cycle1', 100, 0))

    def test_once_survives_reloading_history(self):
        self.assertFalse(model.delivery_due({'cycle':'cycle1','time':100}, 'cycle1', 9999, 0))

    def test_repeat_boundary(self):
        previous = {'cycle':'cycle1','time':100}
        self.assertFalse(model.delivery_due(previous, 'cycle1', 129, 30))
        self.assertTrue(model.delivery_due(previous, 'cycle1', 130, 30))

    def test_new_alarm_cycle(self):
        self.assertTrue(model.delivery_due({'cycle':'cycle1','time':100}, 'cycle2', 101, 0))

    def test_only_new_yellow_alerts(self):
        states = {f'alert.{name}':state(f'alert.{name}', value) for name,value in [('new','on'),('ack','off'),('resolved','idle'),('missing','unavailable')]}
        config = {'yellow_alerts':list(states)}
        self.assertEqual([a['id'] for a in model.active_alarms(states,config)], ['alert.new'])

    def test_yellow_message(self):
        states = {'alert.test':state('alert.test','on',friendly_name='Fenster Küche offen')}
        self.assertEqual(model.active_alarms(states,{'yellow_alerts':['alert.test']})[0]['message'], 'Fenster Küche offen')

    def test_red_global_ack(self):
        states = {'alert.test_rot':state('alert.test_rot','on'), 'input_boolean.alarm_quittiert':state('input_boolean.alarm_quittiert','on')}
        self.assertEqual(model.active_alarms(states,{'red_alerts':['alert.test_rot']}), [])

    def test_no_duplicate_aggregate_red(self):
        states = {'alert.test_rot':state('alert.test_rot','on'), 'sensor.alarmstufe':state('sensor.alarmstufe','rot')}
        self.assertEqual(len(model.active_alarms(states,{'red_alerts':['alert.test_rot']})), 1)

    def test_aggregate_red_causes(self):
        states = {'sensor.alarmstufe':state('sensor.alarmstufe','rot',ursachen=['Leck','HWR'])}
        self.assertEqual(model.active_alarms(states,{})[0]['message'], 'Leck · HWR')

    def test_normal_and_missing_send_nothing(self):
        self.assertEqual(model.active_alarms({}, {'yellow_alerts':['alert.not_here']}), [])
        self.assertEqual(model.active_alarms({'sensor.alarmstufe':state('sensor.alarmstufe','normal')}, {}), [])


if __name__ == '__main__':
    unittest.main()
