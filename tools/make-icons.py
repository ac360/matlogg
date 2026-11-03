#!/usr/bin/env python3
"""Ritar appikonerna (en tallrik med ett blad på grön botten) som PNG utan externa bibliotek.
Kör: python3 tools/make-icons.py"""

import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')

BG_TOP = (34, 160, 99)
BG_BOTTOM = (18, 120, 74)
PLATE = (255, 255, 255)
RIM = (226, 240, 232)
LEAF = (23, 138, 85)


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def coverage(d, aa):
    """Kantutjämning: 1 innanför, 0 utanför, mjuk övergång över aa pixlar."""
    return max(0.0, min(1.0, 0.5 - d / aa))


def pixel(x, y, s):
    u, v = x / s, y / s
    color = mix(BG_TOP, BG_BOTTOM, v)
    aa = 1.5 / s
    cx, cy = 0.5, 0.52
    r = math.hypot(u - cx, v - cy)
    # Tallrik
    color = mix(color, PLATE, coverage(r - 0.33, aa))
    color = mix(color, RIM, coverage(r - 0.25, aa) * 0.9)
    # Blad: två cirkelbågar som skär varandra, roterat 45°
    a = math.radians(-40)
    lx, ly = u - cx, v - cy
    rx, ry = lx * math.cos(a) - ly * math.sin(a), lx * math.sin(a) + ly * math.cos(a)
    d1 = math.hypot(rx, ry - 0.14) - 0.21
    d2 = math.hypot(rx, ry + 0.14) - 0.21
    color = mix(color, LEAF, coverage(max(d1, d2), aa))
    # Bladnerv
    if abs(ry) < 0.006 and abs(rx) < 0.13:
        color = mix(color, RIM, 0.8)
    return color


def write_png(path, s):
    rows = bytearray()
    for y in range(s):
        rows.append(0)
        for x in range(s):
            rows.extend(pixel(x + 0.5, y + 0.5, s))
    raw = zlib.compress(bytes(rows), 9)

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', s, s, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', raw) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, size in [('apple-touch-icon.png', 180), ('icon-192.png', 192), ('icon-512.png', 512)]:
        write_png(os.path.join(OUT, name), size)
        print('skrev', name)
