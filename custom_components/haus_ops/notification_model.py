"""Pure delivery rules shared by the HA notification sender and its tests."""


def delivery_due(previous, cycle, now, interval):
    """Send each new alarm once; repeat only when explicitly configured."""
    if not previous or previous.get("cycle") != cycle:
        return True
    return interval > 0 and now - previous.get("time", now) >= interval


def active_alarms(states, config):
    """Keep acknowledged alerts visible in HA but exclude them from delivery."""
    alarms = []
    ack = states.get(config.get("red_acknowledged", "input_boolean.alarm_quittiert"))
    for level, key in (("yellow", "yellow_alerts"), ("red", "red_alerts")):
        if level == "red" and ack and ack.state == "on":
            continue
        for entity_id in config.get(key, []):
            state = states.get(entity_id)
            if not state or state.state != "on":
                continue
            alarms.append({"id": entity_id, "level": level,
                           "message": state.attributes.get("friendly_name", entity_id),
                           "cycle": state.last_changed.isoformat()})
    # Legacy red sensor is used only without an explicit red alert list.
    if not config.get("red_alerts"):
        state = states.get(config.get("red_sensor", "sensor.alarmstufe"))
        ack = states.get(config.get("red_acknowledged", "input_boolean.alarm_quittiert"))
        if state and state.state.lower() == "rot" and not (ack and ack.state == "on"):
            causes = state.attributes.get("ursachen", [])
            message = " · ".join(map(str, causes)) if isinstance(causes, list) else str(causes)
            alarms.append({"id": state.entity_id, "level": "red",
                           "message": message or "Roter Alarm",
                           "cycle": state.last_changed.isoformat() + "/" + message})
    return alarms
