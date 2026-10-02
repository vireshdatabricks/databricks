from datetime import date

from app.analytics import repository


def test_filter_options_one_query_sorted_case_insensitively(monkeypatch):
    calls = []

    def fake(query, params=None):
        calls.append((query, params))
        return [{"dim": "client_accounts", "value": v} for v in ("eternalHealth", "Beta", "alpha")] + [
            {"dim": "lines_of_business", "value": "HIX"}, {"dim": "assignment_groups", "value": "Team"}]
    monkeypatch.setattr(repository, "run_query", fake)
    result = repository.get_filter_options(date(2026, 9, 21))
    assert len(calls) == 1 and calls[0][1] == {"as_of_week": date(2026, 9, 21)}
    assert result["client_accounts"] == ["alpha", "Beta", "eternalHealth"]
    assert result["lines_of_business"] == ["HIX"] and result["categories"] == []


def test_filter_options_never_contain_null_or_blank(monkeypatch):
    seen = []

    def fake(query, params=None):
        seen.append(query)
        return [{"dim": "categories", "value": v} for v in (None, "", "  ", "BOM")]
    monkeypatch.setattr(repository, "run_query", fake)
    result = repository.get_filter_options(date(2026, 9, 21))
    assert result["categories"] == ["BOM"]
    assert "trim(category) <> ''" in seen[0]
