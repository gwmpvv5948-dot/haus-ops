"""Register the HAUS-OPS wall display in Home Assistant."""

from pathlib import Path

import voluptuous as vol

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

DOMAIN = "haus_ops"
ASSET_URL = "/haus_ops_static"

NAMED_ENTITY = vol.Schema(
    {vol.Required("name"): cv.string, vol.Required("entity"): cv.entity_id}
)

CONFIG_SCHEMA = vol.Schema(
    {
        vol.Required(DOMAIN): vol.Any(
            None,
            vol.Schema(
                {
                    vol.Optional("access"): [NAMED_ENTITY],
                    vol.Optional("timer"): cv.entity_id,
                    vol.Optional("cover"): cv.entity_id,
                    vol.Optional("switches"): [NAMED_ENTITY],
                    vol.Optional("climate"): [NAMED_ENTITY],
                },
                extra=vol.ALLOW_EXTRA,
            ),
        ),
    },
    extra=vol.ALLOW_EXTRA,
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Serve the bundled frontend and register its panel."""
    await hass.http.async_register_static_paths(
        [StaticPathConfig(ASSET_URL, str(Path(__file__).parent / "frontend"), False)]
    )
    frontend.add_extra_js_url(hass, f"{ASSET_URL}/enterprise-icon.js?v=1")
    version = "1.6.0"
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path="haus-ops",
        webcomponent_name="haus-ops",
        sidebar_title="HAUS-OPS",
        sidebar_icon="haus_ops:enterprise",
        module_url=f"{ASSET_URL}/haus-ops.js?v={version}",
        config=config[DOMAIN] or {},
    )
    return True
