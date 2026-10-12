import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / "experiments" / "free_model_benchmark.py"
spec = importlib.util.spec_from_file_location("bench", path)
bench = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bench)

class FreeBenchmarkTests(unittest.TestCase):
    def test_only_free_models_allowed(self):
        catalog = {"data": [
            {"id": "openai/gpt-oss-20b:free", "pricing": {"prompt": "0", "completion": "0"}},
            {"id": "openai/gpt-oss-120b:free", "pricing": {"prompt": "0", "completion": "0"}},
            {"id": "bad/looks-free:free", "pricing": {"prompt": "0.01", "completion": "0"}},
            {"id": "bad/paid", "pricing": {"prompt": "0", "completion": "0"}},
            {"id": "bad/missing:free", "pricing": {}},
            {"id": "bad/not-number:free", "pricing": {"prompt": "oops", "completion": "0"}},
        ]}
        with patch.object(bench, "request_json", return_value=catalog):
            approved = bench.verify_free_ids()
        self.assertEqual(set(approved), {"openai/gpt-oss-20b:free", "openai/gpt-oss-120b:free"})

    def test_openrouter_request_disables_provider_fallback(self):
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "dummy"}):
            with patch.object(bench, "request_json", return_value={"choices": [{"message": {"content": "OK"}}]}) as mock:
                bench.run_openrouter("openai/gpt-oss-20b:free", "Merhaba")
        url, body, headers, timeout = mock.call_args.args
        self.assertEqual(body["provider"]["allow_fallbacks"], False)
        self.assertEqual(body["model"], "openai/gpt-oss-20b:free")
        self.assertEqual(timeout, bench.TIMEOUT)

    def test_summaries_handle_empty_responses(self):
        self.assertEqual(bench.summarize_openrouter({"choices": []}), "")
        self.assertEqual(bench.summarize_gemini({"candidates": []}), "")

    def test_no_credentials_means_no_paid_calls(self):
        with patch.dict(os.environ, {}, clear=True):
            with patch.object(bench, "verify_free_ids", return_value={"openai/gpt-oss-20b:free": True}):
                with patch.object(bench, "run_openrouter") as openrouter:
                    with patch.object(bench, "run_gemini") as gemini:
                        import tempfile
                        with tempfile.TemporaryDirectory() as d:
                            cwd = os.getcwd()
                            try:
                                os.chdir(d)
                                bench.main()
                            finally:
                                os.chdir(cwd)
                        openrouter.assert_not_called()
                        gemini.assert_not_called()

if __name__ == "__main__":
    unittest.main()
