from app.ingestion.extractor import granule_extractor


def test_extractor_unpack(synthetic_imerg_bundle, tmp_path):
    zip_path = synthetic_imerg_bundle["zip_path"]
    granule_id = synthetic_imerg_bundle["granule_id"]
    
    extracted_layers = granule_extractor.extract_zip(str(zip_path), granule_id)
    assert extracted_layers is not None
    assert "precipitation" in extracted_layers
    assert "ice" in extracted_layers
    assert "liquid" in extracted_layers
    assert "liquidPercent" in extracted_layers
    assert "numPrecipHalfHour" in extracted_layers
    assert "numValidHalfHour" in extracted_layers

    # Ensure files exist on disk
    for name, path in extracted_layers.items():
        assert path.exists()
        assert path.stat().st_size > 0
