import re
import unittest
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATH = PROJECT_ROOT / "templates" / "dashboard.html"
SCRIPT_PATH = PROJECT_ROOT / "static" / "dashboard.js"
THEME_PATH = PROJECT_ROOT / "static" / "enterprise.css"


class _DashboardParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.elements = []

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))


class DashboardUiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = TEMPLATE_PATH.read_text(encoding="utf-8")
        cls.script = SCRIPT_PATH.read_text(encoding="utf-8")
        cls.theme = THEME_PATH.read_text(encoding="utf-8")
        cls.parser = _DashboardParser()
        cls.parser.feed(cls.html)
        cls.elements_by_id = {
            attrs["id"]: (tag, attrs)
            for tag, attrs in cls.parser.elements
            if attrs.get("id")
        }

    def test_dom_ids_are_unique_and_cover_javascript_references(self):
        ids = [
            attrs["id"]
            for _, attrs in self.parser.elements
            if attrs.get("id")
        ]
        duplicates = [
            element_id
            for element_id, count in Counter(ids).items()
            if count > 1
        ]
        self.assertEqual(duplicates, [])

        javascript_ids = set(re.findall(r"\$\('([^']+)'\)", self.script))
        missing = sorted(javascript_ids - set(ids))
        self.assertEqual(missing, [])

    def test_tabs_are_accessible_and_connected_to_their_panels(self):
        expected = {
            "dashboardTabButton": "dashboardTab",
            "leadsTabButton": "leadsTab",
            "universeTabButton": "universeTab",
        }
        for button_id, panel_id in expected.items():
            _, button = self.elements_by_id[button_id]
            _, panel = self.elements_by_id[panel_id]
            self.assertEqual(button.get("role"), "tab")
            self.assertEqual(button.get("aria-controls"), panel_id)
            self.assertEqual(panel.get("role"), "tabpanel")
            self.assertEqual(panel.get("aria-labelledby"), button_id)

    def test_enterprise_theme_is_versioned_and_motion_is_respectful(self):
        self.assertIn("/static/enterprise.css?v=3.8.0", self.html)
        self.assertIn("/static/dashboard.js?v=3.8.0", self.html)
        self.assertIn("@media (prefers-reduced-motion: reduce)", self.theme)
        self.assertEqual(self.theme.count("{"), self.theme.count("}"))
        self.assertIn(".decision-loading.hidden", self.theme)

    def test_sql_sync_is_automatic_without_a_manual_button(self):
        self.assertNotIn('id="autoRefreshToggle"', self.html)
        self.assertIn('id="sqlLiveIndicator" class="live-indicator"', self.html)
        self.assertNotIn("refreshSqlData", self.script)

    def test_universe_summary_refreshes_and_renders_catalog_names(self):
        self.assertIn('id="universeListTable"', self.html)
        self.assertIn("vicidial_lists", self.html)
        self.assertIn("loadUniversePriority(true)", self.script)
        self.assertIn("item.list_name", self.script)
        self.assertIn("data.preparing", self.script)
        self.assertIn("loadDecisionDashboard(true)", self.script)

    def test_lead_groups_are_collapsible_and_personalized(self):
        expected_groups = {
            "decisionDashboard",
            "universePriorityDashboard",
            "lead-config-panel",
            "listStatusSummaryPanel",
            "leadPreviewGroup",
            "leadBatchHistoryGroup",
        }
        actual_groups = {
            attrs["id"]
            for _, attrs in self.parser.elements
            if "data-lead-view-group" in attrs
        }
        self.assertEqual(actual_groups, expected_groups)
        for group_id in expected_groups:
            _, attrs = self.elements_by_id[group_id]
            self.assertTrue(attrs.get("data-group-title"))
        self.assertIn("LEAD_VIEW_STORAGE_KEY", self.script)
        self.assertIn("localStorage.setItem", self.script)
        self.assertIn("applyLeadGroupPreset('export-only')", self.script)
        self.assertIn("[data-lead-view-group].is-collapsed", self.theme)

    def test_global_messages_can_be_dismissed_accessibly(self):
        _, message = self.elements_by_id["message"]
        _, close_button = self.elements_by_id["messageClose"]
        self.assertEqual(message.get("aria-hidden"), "true")
        self.assertEqual(close_button.get("type"), "button")
        self.assertEqual(close_button.get("aria-label"), "Cerrar notificación")
        self.assertIn("messageText.textContent = text", self.script)
        self.assertIn("$('messageClose').addEventListener('click', hideMessage)", self.script)
        self.assertIn(".message-close:focus-visible", self.theme)

    def test_global_lead_scope_is_persistent_and_reuses_sql_filters(self):
        self.assertIn("leadGlobalScope", self.elements_by_id)
        self.assertIn("leadGlobalScopeStatus", self.elements_by_id)
        self.assertIn("leadGlobalScopeClear", self.elements_by_id)
        self.assertEqual(self.html.count('id="leadCampaignFilter"'), 1)
        self.assertEqual(self.html.count('id="leadManagementMonthFilter"'), 1)
        self.assertEqual(
            self.html.count('id="leadLastManagementMonthFilter"'),
            1,
        )
        self.assertIn("Mes y año de EntryDate", self.html)
        self.assertIn("Mes de última gestión", self.html)
        self.assertIn("LEAD_SCOPE_STORAGE_KEY", self.script)
        self.assertIn("restoreLeadGlobalScopePreferences()", self.script)
        self.assertIn("saveLeadGlobalScopePreferences()", self.script)
        self.assertIn("campaign_id: getMultiValues('leadCampaignFilter')", self.script)
        self.assertIn(
            "management_month: getMultiValues('leadManagementMonthFilter')",
            self.script,
        )
        self.assertIn(
            "last_management_month: getMultiValues('leadLastManagementMonthFilter')",
            self.script,
        )
        self.assertIn(
            "lastManagementMonths: getMultiValues('leadLastManagementMonthFilter')",
            self.script,
        )
        self.assertIn(".lead-global-scope-status.active", self.theme)

    def test_destination_list_explains_batch_and_csv_naming(self):
        _, batch_name = self.elements_by_id["leadBatchName"]
        _, destination_list = self.elements_by_id["leadDestinationList"]
        self.assertIn("Lista destino está vacía", batch_name.get("placeholder", ""))
        self.assertIn("nombre del lote y del CSV", destination_list.get("placeholder", ""))
        self.assertIn("data.name", self.script)


if __name__ == "__main__":
    unittest.main()
