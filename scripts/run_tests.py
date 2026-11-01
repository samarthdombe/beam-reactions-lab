"""Run every check CI runs, on Windows, macOS or Linux, from any folder.

Run:  python scripts/run_tests.py        (Windows: py scripts\\run_tests.py also works)

1. Python unit tests (unittest discover on tests/).
2. JavaScript syntax check (node --check on public/js/*.js), skipped with a note if Node.js
   is not installed.

Exits with status 0 only when everything that ran passed. Standard library only.
"""
import os
import shutil
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run_python_tests():
    # The tests import beamlab, api.analyze and scripts.run_local, so the repo root must be
    # importable and the working folder must not matter.
    os.chdir(ROOT)
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)
    suite = unittest.defaultTestLoader.discover(start_dir=os.path.join(ROOT, 'tests'), top_level_dir=ROOT)
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    return result.wasSuccessful()


def run_js_syntax_check():
    node = shutil.which('node')
    if node is None:
        print('\nJavaScript check skipped: Node.js not found (install it from https://nodejs.org).')
        return True
    js_dir = os.path.join(ROOT, 'public', 'js')
    files = sorted(f for f in os.listdir(js_dir) if f.endswith('.js'))
    failed = []
    for name in files:
        proc = subprocess.run([node, '--check', os.path.join(js_dir, name)],
                              capture_output=True, text=True)
        if proc.returncode != 0:
            failed.append(name)
            print(proc.stderr, file=sys.stderr)
    print(f'\nJavaScript check: {len(files) - len(failed)}/{len(files)} files OK')
    return not failed


if __name__ == '__main__':
    print(f'Python {sys.version.split()[0]} on {sys.platform}\n')
    python_ok = run_python_tests()
    js_ok = run_js_syntax_check()
    print('\nALL CHECKS PASSED' if python_ok and js_ok else '\nSOME CHECKS FAILED')
    sys.exit(0 if python_ok and js_ok else 1)
