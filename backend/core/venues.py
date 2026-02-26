"""Conference venue configuration for OpenReview API."""

from dataclasses import dataclass


@dataclass
class VenueConfig:
    """Configuration for a conference venue on OpenReview."""
    name: str
    display_name: str
    venue_id_template: str  # e.g. "NeurIPS.cc/{year}/Conference"
    min_year: int = 2024  # earliest supported year
    data_source: str = "openreview"  # "openreview" or "cvf"


# Supported conferences
VENUES: dict[str, VenueConfig] = {
    "NeurIPS": VenueConfig(
        name="NeurIPS",
        display_name="NeurIPS",
        venue_id_template="NeurIPS.cc/{year}/Conference",
    ),
    "ICLR": VenueConfig(
        name="ICLR",
        display_name="ICLR",
        venue_id_template="ICLR.cc/{year}/Conference",
    ),
    "ICML": VenueConfig(
        name="ICML",
        display_name="ICML",
        venue_id_template="ICML.cc/{year}/Conference",
    ),
    "CVPR": VenueConfig(
        name="CVPR",
        display_name="CVPR",
        venue_id_template="thecvf.com/CVPR/{year}/Conference",
        data_source="cvf",
    ),
    "ICCV": VenueConfig(
        name="ICCV",
        display_name="ICCV",
        venue_id_template="thecvf.com/ICCV/{year}/Conference",
        min_year=2023,
        data_source="cvf",
    ),
    "AAAI": VenueConfig(
        name="AAAI",
        display_name="AAAI",
        venue_id_template="AAAI.org/{year}/Conference",
        data_source="semantic_scholar",
    ),
}


def get_venue_id(venue: str, year: int) -> str:
    """Get the OpenReview venue ID for a conference and year."""
    if venue not in VENUES:
        raise ValueError(f"Unsupported venue: {venue}. Supported: {list(VENUES.keys())}")
    config = VENUES[venue]
    return config.venue_id_template.format(year=year)


def get_supported_venues() -> list[dict]:
    """Return list of supported venues with min_year (any year >= min_year is valid)."""
    return [
        {
            "name": v.name,
            "display_name": v.display_name,
            "min_year": v.min_year,
        }
        for v in VENUES.values()
    ]
