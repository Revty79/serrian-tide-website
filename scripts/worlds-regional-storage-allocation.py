"""Read-only allocation measurement for a guarded owned terrain fixture.

Windows: FILE_STANDARD_INFO.AllocationSize (GetFileInformationByHandleEx).
This excludes directory/MFT metadata. No production/runtime dependency.
"""
import ctypes
import json
import os
from pathlib import Path
import re
import sys
import tempfile

root = Path(sys.argv[1]).resolve()
assert root.name == "terrain"
assert root.parent.name.startswith("serrian-atlas-s32-")
assert os.path.normcase(str(root.parent.parent)) == os.path.normcase(str(Path(tempfile.gettempdir()).resolve()))

if os.name == "nt":
    from ctypes import wintypes

    class StandardInfo(ctypes.Structure):
        _fields_ = [("AllocationSize", ctypes.c_longlong), ("EndOfFile", ctypes.c_longlong),
                    ("NumberOfLinks", wintypes.DWORD), ("DeletePending", ctypes.c_ubyte),
                    ("Directory", ctypes.c_ubyte)]

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                                  ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    kernel.CreateFileW.restype = wintypes.HANDLE
    kernel.GetFileInformationByHandleEx.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    kernel.GetFileInformationByHandleEx.restype = wintypes.BOOL
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]

    def allocation(file):
        handle = kernel.CreateFileW(str(file), 0, 7, None, 3, 0, None)
        if handle == ctypes.c_void_p(-1).value:
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            info = StandardInfo()
            if not kernel.GetFileInformationByHandleEx(handle, 1, ctypes.byref(info), ctypes.sizeof(info)):
                raise ctypes.WinError(ctypes.get_last_error())
            return info.EndOfFile, info.AllocationSize
        finally:
            kernel.CloseHandle(handle)
else:
    def allocation(file):
        info = file.stat()
        return info.st_size, info.st_blocks * 512

result = {"objects": 0, "objectPayloadBytes": 0, "objectAllocatedBytes": 0,
          "stagingManifests": 0, "stagingPayloadBytes": 0, "stagingAllocatedBytes": 0,
          "method": "FILE_STANDARD_INFO.AllocationSize" if os.name == "nt" else "st_blocks*512",
          "directoryMetadataIncluded": False}
for file in (root / "objects").glob("*/*.i16"):
    if file.is_symlink() or not file.resolve().is_relative_to(root) or not re.fullmatch(r"[a-f0-9]{64}\.i16", file.name) or file.parent.name != file.name[:2]:
        continue
    payload, allocated = allocation(file)
    result["objects"] += 1
    result["objectPayloadBytes"] += payload
    result["objectAllocatedBytes"] += allocated
for file in (root / "staging").glob("*/manifest.json"):
    if file.is_symlink() or not file.resolve().is_relative_to(root):
        continue
    payload, allocated = allocation(file)
    result["stagingManifests"] += 1
    result["stagingPayloadBytes"] += payload
    result["stagingAllocatedBytes"] += allocated
print(json.dumps(result))
