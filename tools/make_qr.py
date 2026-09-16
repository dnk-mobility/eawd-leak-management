# -*- coding: utf-8 -*-
"""설비별 QR 코드 재생성 (저장소 주소 확정 후 1회 실행용)."""
import os
import qrcode

BASE = "https://dnk-mobility.github.io/eawd-leak-management/"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "qr-codes")

for eq in ("120", "130", "180", "190"):
    url = BASE + "?eq=" + eq
    img = qrcode.make(url, box_size=10, border=4)
    path = os.path.join(OUT, "eq-%s.png" % eq)
    img.save(path)
    print("%-10s -> %s" % (eq, url))
