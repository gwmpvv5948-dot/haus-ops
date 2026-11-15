"""Register the HAUS-OPS wall display in Home Assistant."""

from pathlib import Path

import voluptuous as vol

from homeassistant.components import panel_custom
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
        vol.Required(DOMAIN): vol.Schema(
            {
                vol.Required("access"): [NAMED_ENTITY],
                vol.Required("ventilation"): {
                    vol.Required("entity"): cv.entity_id,
                    vol.Required("options"): vol.All(
                        [cv.string], vol.Length(min=5, max=5)
                    ),
                },
                vol.Required("timer"): cv.entity_id,
                vol.Required("cover"): cv.entity_id,
                vol.Required("switches"): [NAMED_ENTITY],
                vol.Required("climate"): [NAMED_ENTITY],
            }
        )
    },
    extra=vol.ALLOW_EXTRA,
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Serve the bundled frontend and register its panel."""
    await hass.http.async_register_static_paths(
        [StaticPathConfig(ASSET_URL, str(Path(__file__).parent / "frontend"), False)]
    )
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path="haus-ops",
        webcomponent_name="haus-ops",
        sidebar_title="HAUS-OPS",
        sidebar_icon="mdi:monitor-dashboard",
        module_url=f"{ASSET_URL}/haus-ops.js",
        config=config[DOMAIN],
    )
    return True
