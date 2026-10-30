"""Atomic mkdir-lock operations, serialized by a persistent kernel-lock file."""
import fcntl
import os
from pathlib import Path
import shutil
import stat
import sys
import time


def read_owner(path):
    try:
        owner = int((path / "pid").read_text().strip())
        return owner if owner > 0 else None
    except (FileNotFoundError, ValueError):
        return None


def alive(owner):
    try:
        os.kill(owner, 0)
        return True
    except (ProcessLookupError, OverflowError):
        return False
    except PermissionError:
        return True


def operate(action, path, owner):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Never unlink this guard: every process must lock the same inode. Its
    # presence claims no slot, and the kernel releases it if a process dies.
    with open(str(path) + ".guard", "a") as guard:
        try:
            flags = fcntl.LOCK_EX | (fcntl.LOCK_NB if action == "acquire" else 0)
            fcntl.flock(guard, flags)
        except BlockingIOError:
            return 1
        if action == "release":
            if path.is_dir() and not path.is_symlink() and read_owner(path) == owner:
                shutil.rmtree(path)
            return 0
        try:
            info = path.lstat()
        except FileNotFoundError:
            info = None
        if info is not None:
            if stat.S_ISREG(info.st_mode):
                path.unlink()
            elif stat.S_ISDIR(info.st_mode):
                previous = read_owner(path)
                stale = not alive(previous) if previous else time.time() - info.st_mtime > 120
                if not stale:
                    return 1
                pause = os.environ.get("DEBATELAB_LOCK_TEST_PAUSE")
                if pause:
                    # Tests only: hold the guard here to prove a second caller is refused.
                    Path(pause + ".ready").touch()
                    while not Path(pause).exists():
                        time.sleep(0.05)
                shutil.rmtree(path)
            else:
                return 1
        path.mkdir()
        (path / "pid").write_text(str(owner) + "\n")
        return 0


if __name__ == "__main__":
    try:
        sys.exit(operate(sys.argv[1], Path(sys.argv[2]), int(sys.argv[3])))
    except OSError as error:
        print(f"lock: {sys.argv[1]} failed for {sys.argv[2]} ({type(error).__name__})", file=sys.stderr)
        sys.exit(2)
