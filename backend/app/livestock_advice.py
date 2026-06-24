"""Stocking advice — a small, transparent rules layer in the LFS-owner voice
(CLAUDE.md §0). Advisory only: it flags bioload, aggression, and compatibility
concerns when adding livestock; it never blocks the add. Every message traces to
a plain rule you can read here — no black box.
"""
from __future__ import annotations

from typing import List

# Rough nano stocking guide: ~1 small fish per 6 gal of display volume.
GAL_PER_FISH = 6


def advise(volume_gal: float, alive, new_type: str, common_name: str) -> List[dict]:
    """`alive` is the list of currently-alive Livestock rows. Returns advice dicts
    {level, text} with level in info/caution/warn."""
    name = (common_name or "").lower()
    t = (new_type or "fish").lower()
    out: List[dict] = []

    if t == "fish":
        fish = [x for x in alive if (x.type or "").lower() == "fish"]
        cap = max(1, int(volume_gal // GAL_PER_FISH))
        if len(fish) + 1 > cap:
            out.append({
                "level": "caution",
                "text": (
                    f"That'd be fish #{len(fish) + 1} in {int(volume_gal)} gallons — past the "
                    f"~{cap} small fish a tank this size comfortably holds. Nanos punch above their "
                    "weight, but bioload climbs fast; make sure your skimmer and water changes keep up."
                ),
            })

        if "tang" in name:
            out.append({
                "level": "warn",
                "text": "Tangs need open swimming room a 29-gallon just can't give — most outgrow a "
                        "nano within a year and get stressed (and ich-prone) in the meantime. I'd skip it.",
            })
        if any(k in name for k in ("mandarin", "dragonet", "scooter")):
            out.append({
                "level": "caution",
                "text": "Mandarins and dragonets graze copepods all day. A young nano rarely sustains "
                        "the pod population to feed one — wait until the tank's well established, and a "
                        "refugium helps a lot.",
            })
        if "clown" in name and any("clown" in (x.common_name or "").lower() for x in fish):
            out.append({
                "level": "caution",
                "text": "You've already got a clownfish. Two clowns only get along as a bonded pair or "
                        "same species added together — otherwise expect squabbling. Different species "
                        "rarely cohabit.",
            })
        if any(k in name for k in ("damsel", "dottyback", "maroon")):
            out.append({
                "level": "caution",
                "text": "Damsels, dottybacks and maroon clowns turn territorial in small tanks. Add them "
                        "last so they don't bully the fish that come after.",
            })

        out.append({
            "level": "info",
            "text": "Quarantine new fish if you can — it's the cheapest insurance against a tank-wide "
                    "outbreak, and patience here saves heartbreak later.",
        })

    elif t == "coral":
        out.append({
            "level": "info",
            "text": "Drip-acclimate, dip for pests, and start it low in the tank — then move it up over a "
                    "week or two as it adjusts to your light. No rush.",
        })

    return out
