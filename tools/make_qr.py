# -*- coding: utf-8 -*-
"""채널별 QR 코드 생성 (주소가 바뀔 때 BASE 값만 고치고 재실행).

2026-09-18: 전체계(130·190)를 하우징/인버터 채널로 분리해 4개 -> 6개.
eq 키는 index.html 의 EQ_IDS 와 반드시 같아야 한다.
2026-09-21: 대시보드(전체 현황, dashboard.html) QR을 추가했다 — 6개 채널
QR과 별개로, 관리자가 한 화면에서 전체 채널을 훑어볼 때 이 QR로 바로 들어간다.
"""
import os
import qrcode

BASE = "https://dnk-mobility.github.io/eawd-leak-management/"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "qr-codes")

CHANNELS = [
    ("120",   "조립전 유로계"),
    ("130-h", "조립전 전체계(하우징)"),
    ("130-i", "조립전 전체계(인버터)"),
    ("180",   "조립후 유로계"),
    ("190-h", "조립후 전체계(하우징)"),
    ("190-i", "조립후 전체계(인버터)"),
]

for eq, label in CHANNELS:
    url = BASE + "?eq=" + eq
    img = qrcode.make(url, box_size=10, border=4)
    path = os.path.join(OUT, "eq-%s.png" % eq)
    img.save(path)
    print("%-8s %-16s -> %s" % (eq, label, url))

dash_url = BASE + "dashboard.html"
dash_img = qrcode.make(dash_url, box_size=10, border=4)
dash_path = os.path.join(OUT, "dashboard.png")
dash_img.save(dash_path)
print("%-8s %-16s -> %s" % ("dash", "전체 현황", dash_url))
