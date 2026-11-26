#!/usr/bin/env python3
"""JF沖縄魚市場（糸満・ichiba=119）の全魚種日別データを取得して data/market.json を更新する。

使い方:
  python scripts/update_market.py              # 前回の最終日〜今日(JST)を取得して追記
  python scripts/update_market.py --backfill 365  # 過去365日のうち未取得の日をさかのぼって取得
  python scripts/update_market.py --csv FILE   # CSV(date,gyoid,name,amount,kg)から取り込む
出力:
  data/history.json  全期間（価格推移のグラフ用、アプリは必要なときだけ読む）
  data/market.json   直近の取引（予想単価・ランキング用、毎回読む）
魚種は積み上げ式: 一度出た魚種は消さず、古い取引も最後の数件は残す。
1日分の行: [日付, 金額(円), 水揚量(kg), 高値(円/kg), 安値(円/kg)]
"""
import argparse, csv, json, re, sys, time, urllib.request
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from species_names import WAMEI, PER_FISH_KG, TARGET  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "market.json"
HIST = ROOT / "data" / "history.json"
URL = "https://www.okinawa-fish.jp/shikyou/gyosyu/?date={d}&syuukei=ken&ichiba=119"
KEEP_DAYS = 800      # 全期間ファイルに残す日数
RECENT_DAYS = 45     # market.json に入れる日数
KEEP_MIN_ROWS = 10   # ただし魚種ごとに最後の10件は必ず残す
JST = timezone(timedelta(hours=9))


class Table(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell, self.href, self.in_cell = [], None, "", None, False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "tr":
            self.row, self.href = [], None
        elif tag in ("td", "th") and self.row is not None:
            self.in_cell, self.cell = True, ""
        elif tag == "a" and self.row is not None and "gyoid=" in (a.get("href") or ""):
            self.href = a["href"]

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.row is not None and self.in_cell:
            self.row.append(re.sub(r"\s+", " ", self.cell).strip())
            self.in_cell = False
        elif tag == "tr" and self.row is not None:
            self.rows.append((self.row, self.href))
            self.row = None

    def handle_data(self, data):
        if self.in_cell:
            self.cell += data


def num(s):
    s = (s or "").replace(",", "").replace("円", "").replace("kg", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def fetch_day(d: date):
    req = urllib.request.Request(URL.format(d=d.isoformat()), headers={"User-Agent": "gyokaku-market-updater/1.0"})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    if "情報がありませんでした" in html:
        return []
    if not re.search(rf"{d.year}年0?{d.month}月0?{d.day}日", html):
        print(f"  {d}: ページの日付が一致しないためスキップ", file=sys.stderr)
        return []
    p = Table()
    p.feed(html)
    out = []
    for cells, href in p.rows:
        if not href or len(cells) < 6:
            continue
        m = re.search(r"gyoid=(\d+)", href)
        amount, kg = num(cells[4]), num(cells[5])
        if not m or amount is None or kg is None or cells[0] in ("合計", ""):
            continue
        out.append({"date": d.isoformat(), "gyoid": int(m.group(1)), "name": cells[0], "amount": amount, "kg": kg,
                    "high": num(cells[1]), "low": num(cells[2])})
    if not out:
        raise RuntimeError(f"{d}: 表を読み取れませんでした（ページの構造が変わった可能性があります）")
    return out


def load():
    for p in (HIST, OUT):
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            d.setdefault("fetched", [])
            return d
    return {"updated": "", "latest": "", "source": URL.split("?")[0] + "?ichiba=119", "species": [], "fetched": []}


def merge(data, rows):
    by = {s["g"]: s for s in data["species"]}
    for r in rows:
        s = by.get(r["gyoid"])
        if not s:
            s = {"g": r["gyoid"], "n": r["name"], "d": []}
            data["species"].append(s)
            by[r["gyoid"]] = s
        s["n"] = r["name"]
        row = [r["date"], round(r["amount"]), round(r["kg"], 1)]
        if r.get("high") is not None:
            row += [round(r["high"]), round(r["low"] or 0)]
        s["d"] = [x for x in s["d"] if x[0] != r["date"]] + [row]
    return data


def finish(data):
    today = datetime.now(JST).date()
    cutoff = (today - timedelta(days=KEEP_DAYS)).isoformat()
    latest = ""
    for s in data["species"]:
        s["d"].sort(key=lambda x: x[0])
        keep = [x for x in s["d"] if x[0] >= cutoff]
        s["d"] = keep if len(keep) >= KEEP_MIN_ROWS else s["d"][-KEEP_MIN_ROWS:]
        if WAMEI.get(s["n"]):
            s["j"] = WAMEI[s["n"]]
        if PER_FISH_KG.get(s["n"]):
            s["per"] = PER_FISH_KG[s["n"]]
        if s["n"] in TARGET:
            s["t"] = 1
        else:
            s.pop("t", None)
        if s["d"] and s["d"][-1][0] > latest:
            latest = s["d"][-1][0]
    data["species"].sort(key=lambda s: s["g"])
    data["latest"] = latest
    data["updated"] = datetime.now(JST).strftime("%Y-%m-%dT%H:%M+09:00")
    data["fetched"] = sorted(set(data.get("fetched", [])))[-KEEP_DAYS:]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    HIST.write_text(dump(data), encoding="utf-8")
    rc = (today - timedelta(days=RECENT_DAYS)).isoformat()
    recent = {k: v for k, v in data.items() if k not in ("species", "fetched")}
    recent["species"] = []
    for s in data["species"]:
        keep = [x for x in s["d"] if x[0] >= rc]
        recent["species"].append({**s, "d": keep if len(keep) >= KEEP_MIN_ROWS else s["d"][-KEEP_MIN_ROWS:]})
    OUT.write_text(dump(recent), encoding="utf-8")
    print(f"保存: {HIST.name}・{OUT.name}（{len(data['species'])}魚種、最終取引日 {latest}、取得済み {len(data['fetched'])}日）")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv")
    ap.add_argument("--days", type=int, default=14, help="前回データがないときに遡る日数")
    ap.add_argument("--backfill", type=int, default=0, help="過去N日のうち未取得の日を取得する")
    a = ap.parse_args()
    data = load()
    if a.csv:
        with open(a.csv, encoding="utf-8") as f:
            rows = [{"date": r["date"], "gyoid": int(r["gyoid"]), "name": r["name"], "amount": float(r["amount"]), "kg": float(r["kg"])} for r in csv.DictReader(f)]
        merge(data, rows)
    else:
        today = datetime.now(JST).date()
        start = date.fromisoformat(data["latest"]) if data.get("latest") else today - timedelta(days=a.days)
        # 当日分は昼前に途中経過が出るため、最終日も取り直す
        days = []
        d = start
        while d <= today:
            days.append(d)
            d += timedelta(days=1)
        if a.backfill:
            done = set(data["fetched"])
            for i in range(a.backfill, 0, -1):
                b = today - timedelta(days=i)
                if b < start and b.isoformat() not in done:
                    days.append(b)
        got, errors = 0, []
        for d in sorted(set(days)):
            if d.weekday() == 6:  # 日曜は取引なし
                continue
            try:
                rows = fetch_day(d)
                merge(data, rows)
                got += len(rows)
                if d < today:
                    data["fetched"].append(d.isoformat())
                print(f"  {d}: {len(rows)}件")
            except Exception as e:  # noqa: BLE001
                errors.append(f"{d}: {e}")
            time.sleep(2)
        for e in errors:
            print("エラー " + e, file=sys.stderr)
        if errors and not got:
            sys.exit(1)
    finish(data)


if __name__ == "__main__":
    main()
