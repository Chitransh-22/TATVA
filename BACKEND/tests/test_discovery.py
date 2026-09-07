import pytest
from datetime import datetime, timezone
from app.ingestion.discovery import parse_imerg_filename, GranuleDiscoveryService


def test_parse_imerg_filename_valid():
    filename = "3B-HHR-L.MS.MRG.3IMERG.20260903-S053000-E055959.0330.V07C.7day.zip"
    parsed = parse_imerg_filename(filename)
    
    assert parsed is not None
    assert parsed["granule_id"] == "3B-HHR-L.MS.MRG.3IMERG.20260903-S053000-E055959.0330.V07C.7day"
    assert parsed["filename"] == filename
    assert parsed["observation_time"] == datetime(2026, 9, 3, 5, 30, 0, tzinfo=timezone.utc)


def test_parse_imerg_filename_without_zip_extension():
    filename = "3B-HHR-L.MS.MRG.3IMERG.20260903-S053000-E055959.0330.V07C.7day"
    parsed = parse_imerg_filename(filename)
    
    assert parsed is not None
    assert parsed["granule_id"] == filename
    assert parsed["observation_time"] == datetime(2026, 9, 3, 5, 30, 0, tzinfo=timezone.utc)


def test_parse_invalid_filename():
    assert parse_imerg_filename("random_unrelated_file.txt") is None
    assert parse_imerg_filename("not_imerg.zip") is None


def test_discovery_service_text_parsing(monkeypatch):
    """Test PPS directory text scraper with mock response."""
    service = GranuleDiscoveryService()
    
    mock_pps_text = """
-rw-r--r-- 1 pps pps 2345678 Sep 03 06:10 3B-HHR-L.MS.MRG.3IMERG.20260903-S053000-E055959.0330.V07C.7day.zip
-rw-r--r-- 1 pps pps  123456 Sep 03 06:10 some_other_doc.pdf
-rw-r--r-- 1 pps pps 2456789 Sep 03 06:40 3B-HHR-L.MS.MRG.3IMERG.20260903-S060000-E062959.0360.V07C.7day.zip
"""
    class MockResponse:
        status_code = 200
        text = mock_pps_text

    monkeypatch.setattr("requests.get", lambda *args, **kwargs: MockResponse())
    
    granules = service.discover_from_pps_directory(year=2026, month=9)
    assert len(granules) == 2
    assert granules[0].granule_id == "3B-HHR-L.MS.MRG.3IMERG.20260903-S053000-E055959.0330.V07C.7day"
    assert granules[0].file_size_bytes == 2345678
    assert granules[1].granule_id == "3B-HHR-L.MS.MRG.3IMERG.20260903-S060000-E062959.0360.V07C.7day"
