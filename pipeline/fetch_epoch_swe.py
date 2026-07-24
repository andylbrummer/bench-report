import json
import os
import struct
import time
import zlib

import pandas as pd
import requests

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "epoch_swe")
CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "epoch", "swe_bench_verified.csv")


def fetch_range(url, start, end, retries=4):
    want = end - start + 1
    for attempt in range(retries):
        try:
            r = requests.get(url, headers={"Range": f"bytes={start}-{end}"}, timeout=180, stream=True)
            content = r.raw.read(decode_content=False) if hasattr(r.raw, "read") else r.content
            if r.status_code == 206:
                cr = r.headers.get("Content-Range", "")
                got_start = int(cr.split()[1].split("-")[0]) if cr.startswith("bytes") else None
                if got_start is not None and got_start <= start and len(content) >= (end - got_start + 1):
                    return content[start - got_start: start - got_start + want]
                if len(content) >= want:
                    return content[:want]
            r.raise_for_status()
            raise ValueError(f"bad range response: {r.status_code}, {len(content)} bytes")
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def object_size(url):
    r = requests.get(url, headers={"Range": "bytes=0-0"}, timeout=60)
    r.raise_for_status()
    return int(r.headers["Content-Range"].split("/")[1])


def parse_extra_for_zip64(extra, need_uncomp, need_comp, need_lho):
    vals = []
    i = 0
    while i + 4 <= len(extra):
        tag, sz = struct.unpack_from("<HH", extra, i)
        body = extra[i + 4:i + 4 + sz]
        if tag == 0x0001:
            j = 0
            out = []
            for need in (need_uncomp, need_comp, need_lho):
                if need:
                    out.append(struct.unpack_from("<Q", body, j)[0])
                    j += 8
                else:
                    out.append(None)
            return out
        i += 4 + sz
    return [None, None, None]


def read_zip_entry(url, wanted):
    size = object_size(url)
    tail = fetch_range(url, size - 65536, size - 1)
    eocd = tail.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise ValueError("no EOCD")
    cd_size, cd_off = struct.unpack_from("<II", tail, eocd + 12)
    if cd_off == 0xFFFFFFFF or cd_size == 0xFFFFFFFF:
        loc = tail.rfind(b"PK\x06\x07")
        if loc < 0:
            raise ValueError("ZIP64 markers without locator")
        z64_off = struct.unpack_from("<Q", tail, loc + 8)[0]
        z64 = fetch_range(url, z64_off, z64_off + 55)
        cd_size, cd_off = struct.unpack_from("<QQ", z64, 40)
    cd = fetch_range(url, cd_off, cd_off + cd_size - 1)
    i = 0
    while i < len(cd) - 46:
        if cd[i:i + 4] != b"PK\x01\x02":
            break
        method = struct.unpack_from("<H", cd, i + 10)[0]
        comp_size, uncomp_size = struct.unpack_from("<II", cd, i + 20)
        nlen, elen, clen = struct.unpack_from("<HHH", cd, i + 28)
        lho = struct.unpack_from("<I", cd, i + 42)[0]
        if comp_size == 0xFFFFFFFF or uncomp_size == 0xFFFFFFFF or lho == 0xFFFFFFFF:
            extra = cd[i + 46 + nlen:i + 46 + nlen + elen]
            u, c, o = parse_extra_for_zip64(extra, uncomp_size == 0xFFFFFFFF,
                                            comp_size == 0xFFFFFFFF, lho == 0xFFFFFFFF)
            uncomp_size = u if u is not None else uncomp_size
            comp_size = c if c is not None else comp_size
            lho = o if o is not None else lho
        name = cd[i + 46:i + 46 + nlen].decode()
        if name == wanted:
            lh = fetch_range(url, lho, lho + 29)
            lnlen, lnelen = struct.unpack_from("<HH", lh, 26)
            data = fetch_range(url, lho + 30 + lnlen + lnelen,
                               lho + 30 + lnlen + lnelen + comp_size - 1)
            if method == 8:
                return zlib.decompress(data, -15)
            if method == 93:
                import io
                import zstandard
                with zstandard.ZstdDecompressor().stream_reader(io.BytesIO(data)) as zr:
                    return zr.read()
            return data
        i += 46 + nlen + elen + clen
    raise KeyError(wanted)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    df = pd.read_csv(CSV_PATH)
    frames, dates = [], {}
    for _, r in df.iterrows():
        logs = r.get("Logs")
        model = str(r["Model version"])
        released = r.get("Release date")
        if not isinstance(logs, str) or not logs.endswith(".eval"):
            print(f"  skip {model}: no logs")
            continue
        dest = os.path.join(OUT_DIR, f"{model.replace('/', '_')}.json")
        if os.path.exists(dest):
            print(f"  cached {model}")
        else:
            try:
                raw = None
                for attempt in range(3):
                    try:
                        raw = read_zip_entry(logs, "summaries.json")
                        break
                    except requests.HTTPError:
                        raise
                    except Exception:
                        if attempt == 2:
                            raise
                        time.sleep(3)
                summaries = json.loads(raw)
                scores = {s["id"]: 1.0 if s["scores"]["swe_bench_scorer"]["value"] == "C" else 0.0
                          for s in summaries if "swe_bench_scorer" in s.get("scores", {})}
                json.dump(scores, open(dest, "w"))
                print(f"  {model}: {len(scores)} instances, {sum(scores.values()):.0f} solved")
            except Exception as e:
                print(f"  FAILED {model}: {e}")
                continue
        scores = json.load(open(dest))
        frames.append(pd.DataFrame({"model_raw": model, "problem_id": list(scores.keys()),
                                    "pass1": list(scores.values())}))
        if isinstance(released, str) and released:
            dates[model] = released[:10]
    if frames:
        out = pd.concat(frames, ignore_index=True)
        out.to_parquet(os.path.join(OUT_DIR, "matrix.parquet"))
        json.dump(dates, open(os.path.join(OUT_DIR, "dates.json"), "w"), indent=1)
        print(f"matrix: {out.shape[0]} rows, {out['model_raw'].nunique()} runs")


if __name__ == "__main__":
    main()
