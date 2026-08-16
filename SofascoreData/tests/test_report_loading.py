import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import predict_today

from predict_today import load_existing_report

TARGET_DATE = '2026-08-16'


def _valid_report():
    return {
        'date': TARGET_DATE,
        'status': 'unfinished',
        'summary': {},
        'matches': [],
    }


class LoadExistingReportTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.reports_dir = Path(self._tmp.name)
        self.date_dir = self.reports_dir / TARGET_DATE
        self.date_dir.mkdir(parents=True)
        self._patch = patch.object(predict_today, 'REPORTS_DIR', self.reports_dir)
        self._patch.start()

    def tearDown(self):
        self._patch.stop()
        self._tmp.cleanup()

    def _write(self, name, contents):
        path = self.date_dir / name
        path.write_text(contents, encoding='utf-8')
        return path

    def test_valid_report_loads(self):
        self._write('predictions_unfinished.json', json.dumps(_valid_report()))

        report = load_existing_report(TARGET_DATE)

        self.assertIsNotNone(report)
        self.assertEqual(report['date'], TARGET_DATE)

    def test_corrupt_report_is_quarantined_and_returns_none(self):
        path = self._write('predictions_finished.json', '{"date": "2026-08-16", "matches": [')

        report = load_existing_report(TARGET_DATE)

        self.assertIsNone(report)
        self.assertFalse(path.exists())
        quarantined = list(self.date_dir.glob('predictions_finished.json.corrupt-*'))
        self.assertEqual(len(quarantined), 1)

    def test_non_object_report_is_quarantined(self):
        path = self._write('predictions_finished.json', '[1, 2, 3]')

        report = load_existing_report(TARGET_DATE)

        self.assertIsNone(report)
        self.assertFalse(path.exists())
        self.assertEqual(len(list(self.date_dir.glob('predictions_finished.json.corrupt-*'))), 1)

    def test_corrupt_file_falls_back_to_other_status(self):
        self._write('predictions_finished.json', 'not json at all')
        self._write('predictions_unfinished.json', json.dumps(_valid_report()))

        report = load_existing_report(TARGET_DATE)

        self.assertIsNotNone(report)
        self.assertEqual(report['status'], 'unfinished')
        self.assertEqual(len(list(self.date_dir.glob('predictions_finished.json.corrupt-*'))), 1)

    def test_missing_report_returns_none(self):
        self.assertIsNone(load_existing_report(TARGET_DATE))


if __name__ == '__main__':
    unittest.main()
