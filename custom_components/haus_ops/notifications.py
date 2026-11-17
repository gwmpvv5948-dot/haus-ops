"""Persisted, browser-independent Companion App alarm delivery."""
from __future__ import annotations

import asyncio
from datetime import timedelta
import logging
import time

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED, EVENT_STATE_CHANGED
from homeassistant.core import callback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store

from .notification_model import active_alarms, delivery_due

_LOGGER = logging.getLogger(__name__)
DOMAIN = "haus_ops"
ENTITY = vol.Match(r"^alert\.[a-z0-9_]+$")
SERVICE = vol.Match(r"^mobile_app_[a-z0-9_]+$")
LEVEL = vol.Schema({
    vol.Required("recipients", default=[]): [SERVICE],
    vol.Required("repeat_seconds", default=0): vol.Any(0, vol.All(vol.Coerce(int), vol.Range(min=30, max=3600))),
    vol.Required("critical", default=False): bool,
})
CONFIG = vol.Schema({
    vol.Required("yellow", default=dict): LEVEL,
    vol.Required("red", default=dict): LEVEL,
    vol.Required("yellow_alerts", default=[]): [ENTITY],
    vol.Required("red_alerts", default=[]): [ENTITY],
    vol.Required("red_sensor", default="sensor.alarmstufe"): vol.Match(r"^sensor\.[a-z0-9_]+$"),
    vol.Required("red_acknowledged", default="input_boolean.alarm_quittiert"): vol.Match(r"^input_boolean\.[a-z0-9_]+$"),
})


class AlarmNotifications:
    def __init__(self, hass, defaults):
        self.hass = hass
        self.store = Store(hass, 1, "haus_ops.mobile_notifications")
        self.config = CONFIG(defaults)
        self.sent = {}
        self.lock = asyncio.Lock()
        self.task = None

    async def setup(self):
        saved = await self.store.async_load()
        if saved:
            self.config = CONFIG(saved.get("config", self.config))
            self.sent = saved.get("sent", {})
        self.hass.bus.async_listen(EVENT_STATE_CHANGED, self.changed)
        async_track_time_interval(self.hass, self.schedule, timedelta(seconds=30))
        if self.hass.is_running:
            self.schedule()
        else:
            self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, self.schedule)

    @callback
    def changed(self, event):
        entity_id = event.data.get("entity_id", "")
        if entity_id.startswith("alert.") or entity_id in (self.config["red_sensor"], self.config["red_acknowledged"]):
            if self.hass.is_running:
                self.schedule()

    @callback
    def schedule(self, _event=None):
        if self.task is None or self.task.done():
            self.task = self.hass.async_create_task(self.deliver())

    def devices(self):
        return [{"service": name, "name": name.removeprefix("mobile_app_").replace("_", " ").replace("iphone", "iPhone").replace("ipad", "iPad")}
                for name in sorted(self.hass.services.async_services().get("notify", {}))
                if name.startswith("mobile_app_")]

    async def save(self, config):
        async with self.lock:
            self.config = CONFIG(config)
            await self.store.async_save({"config": self.config, "sent": self.sent})
        self.schedule()

    async def deliver(self):
        async with self.lock:
            alarms = active_alarms(self.hass.states, self.config)
            active_ids = {alarm["id"] for alarm in alarms}
            # Acknowledged alarms retain their delivery history to avoid duplicates.
            stale = [key for key in self.sent if key.split("|", 1)[0] not in active_ids
                     and (self.hass.states.get(key.split("|", 1)[0]) is None
                          or self.hass.states.get(key.split("|", 1)[0]).state in ("idle", "normal"))]
            for key in stale:
                del self.sent[key]
            changed = bool(stale)
            for alarm in alarms:
                options = self.config[alarm["level"]]
                for recipient in dict.fromkeys(options["recipients"]):
                    key = alarm["id"] + "|" + recipient
                    now = time.time()
                    if not delivery_due(self.sent.get(key), alarm["cycle"], now, options["repeat_seconds"]):
                        continue
                    if not self.hass.services.has_service("notify", recipient):
                        continue
                    if not any(item["id"] == alarm["id"] and item["cycle"] == alarm["cycle"]
                               for item in active_alarms(self.hass.states, self.config)):
                        continue
                    payload = {"title": "Roter Alarm" if alarm["level"] == "red" else "Gelber Alarm",
                               "message": alarm["message"],
                               "data": {"tag": "haus-ops-" + alarm["id"], "url": "/haus-ops"}}
                    if alarm["level"] == "red" and options["critical"]:
                        payload["data"].update({"push": {"sound": {"name": "default", "critical": 1, "volume": 1.0}},
                                                "priority": "high", "ttl": 0})
                    try:
                        await self.hass.services.async_call("notify", recipient, payload, blocking=True)
                    except Exception:  # One unreachable device must not block other recipients.
                        _LOGGER.exception("HAUS-OPS: Mobile Benachrichtigung fehlgeschlagen (%s)", recipient)
                        continue
                    self.sent[key] = {"cycle": alarm["cycle"], "time": now}
                    changed = True
            if changed:
                await self.store.async_save({"config": self.config, "sent": self.sent})


@websocket_api.websocket_command({vol.Required("type"): "haus_ops/notifications/get"})
@callback
def ws_get(hass, connection, msg):
    connection.require_admin()
    sender = hass.data[DOMAIN]["notifications"]
    connection.send_result(msg["id"], {"config": sender.config, "devices": sender.devices()})


@websocket_api.websocket_command({vol.Required("type"): "haus_ops/notifications/save", vol.Required("config"): CONFIG})
@websocket_api.async_response
async def ws_save(hass, connection, msg):
    connection.require_admin()
    sender = hass.data[DOMAIN]["notifications"]
    available = {item["service"] for item in sender.devices()}
    if any(service not in available for level in ("yellow", "red") for service in msg["config"][level]["recipients"]):
        connection.send_error(msg["id"], "invalid_recipient", "Mobile-App-Aktion ist nicht verfügbar.")
        return
    await sender.save(msg["config"])
    connection.send_result(msg["id"])


async def async_setup_notifications(hass, defaults):
    sender = AlarmNotifications(hass, defaults)
    hass.data.setdefault(DOMAIN, {})["notifications"] = sender
    await sender.setup()
    websocket_api.async_register_command(hass, ws_get)
    websocket_api.async_register_command(hass, ws_save)
