from entities import Entity


WEAPONS = ["sw", "bo", "ma", "ax", "ha", "st"]
WEAPON_PREFIXES = ["plain", "forged", "sharp", "broad", "old", "leg", "fla",
                   "agile", "bane", "ench", "evil", "spite", "ether", "ancie"]


class ItemEntity(Entity):

    def __init__(self, item_code, x, y, *args):
        super(ItemEntity, self).__init__(*args)

        self.position = x, y
        self.height, self.width = 40, 40

        self.item_code = item_code

    def on_player_range(self, guid, distance):
        if distance >= 1 or guid.startswith("%"):
            return

        # Give thine self to a nearby entity/player.
        self.location.notify_location("giv", "%s:%s" % (guid, self.item_code))

        # Destroy thine self.
        self.location.destroy_entity(self)

    def _get_properties(self):
        weapon = self.item_code.startswith("w")
        sprite_x = 5 * 24 if weapon else 0
        if not weapon:
            code = int(self.item_code[1:])
            sprite_x += code % 5 * 24
            sprite_y = int(code / 5) * 24
        else:
            weapon, prefix, level = self.item_code[1:].split(".")
            sprite_y = WEAPONS.index(weapon) * 24
            sprite_x = WEAPON_PREFIXES.index(prefix) * 24 + 120

        base = super(ItemEntity, self)._get_properties()
        base["image"] = "items"
        base["layer"] = 3
        base["view"] = {"type": "static",
                        "sprite": {"x": sprite_x,
                                   "y": sprite_y,
                                   "swidth": 24,
                                   "sheight": 24}}
        base["movement"] = {"type": "callback",
                            "callback": "item_hover"}
        return base

