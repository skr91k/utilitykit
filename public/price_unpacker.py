#!/usr/bin/env python3
"""
Price Unpacker — decode bit-packed OHLC binary zip entries.
Port of BahvRepo4.byteArrayToresponseMC (Kotlin).

Usage:
    python price_unpacker.py [zip_file]
"""

import zipfile, json, os, sys, math

try:
    import numpy as np
    HAS_NP = True
except ImportError:
    HAS_NP = False


def read_u32(data: bytes, offset: int) -> int:
    return (data[offset] << 24) | (data[offset+1] << 16) | (data[offset+2] << 8) | data[offset+3]


def bit_unpack(data: bytes, start_byte: int, count: int, bpv: int):
    """MSB-first bit-packed integers. Returns numpy array if numpy present."""
    if bpv == 0 or count == 0:
        return np.zeros(count, np.int64) if HAS_NP else [0] * count
    needed = math.ceil(count * bpv / 8)
    if HAS_NP:
        chunk  = np.frombuffer(data[start_byte:start_byte + needed], dtype=np.uint8)
        bits   = np.unpackbits(chunk)[:count * bpv].reshape(count, bpv)
        powers = (1 << np.arange(bpv - 1, -1, -1, dtype=np.int64))
        return bits.astype(np.int64) @ powers
    n     = int.from_bytes(data[start_byte:start_byte + needed], 'big')
    total = needed * 8
    mask  = (1 << bpv) - 1
    return [(n >> (total - (i + 1) * bpv)) & mask for i in range(count)]


def _rls(data, pos, count):
    """read_long_section returning (scaled, gdc, bytes_consumed)."""
    start_pos = pos
    gdc    = read_u32(data, pos);  pos += 4
    start  = read_u32(data, pos);  pos += 4
    offset = read_u32(data, pos);  pos += 4
    bits   = data[pos];            pos += 1
    blen   = math.ceil(count * bits / 8)
    sh     = bit_unpack(data, pos, count, bits); pos += blen
    if HAS_NP:
        arr    = sh.astype(np.int64) - offset
        arr[0] = start
        sc     = np.cumsum(arr)
    else:
        sc = [0] * count; sc[0] = start
        for i in range(1, count):
            sc[i] = sc[i - 1] + (sh[i] - offset)
    return sc, gdc, pos - start_pos


def decode_entry(data: bytes) -> dict:
    pos     = 0
    sym_len = data[pos]; pos += 1
    symbol  = data[pos:pos+sym_len].decode(); pos += sym_len
    tfs     = read_u32(data, pos); pos += 4

    if tfs == 86400:
        cnt = read_u32(data, pos); pos += 4
        sc, gdc, consumed = _rls(data, pos, cnt); pos += consumed
        timestamps = (sc * gdc).tolist() if HAS_NP else [s * gdc for s in sc]
    else:
        ts  = read_u32(data, pos); pos += 4
        te  = read_u32(data, pos); pos += 4
        cnt = round((te - ts) / tfs) + 1
        timestamps = [ts + i * tfs for i in range(cnt)]

    n = len(timestamps)
    t = timestamps
    o, h, l, c, v, oi, iv = [], [], [], [], [], [], []

    # 0=end  1=close-only  2=ohlc  3=volume  4=oi  5=iv
    while pos < len(data):
        tag = data[pos]; pos += 1
        if tag == 0:
            break
        elif tag == 1:
            power = read_u32(data, pos); pos += 4
            scale = 10 ** power
            sc, gdc, consumed = _rls(data, pos, n); pos += consumed
            if HAS_NP:
                vals = (sc * gdc / scale).tolist()
            else:
                vals = [s * gdc / scale for s in sc]
            o = vals; h = list(vals); l = list(vals); c = list(vals)
        elif tag == 2:
            power = read_u32(data, pos); pos += 4
            scale = 10 ** power
            sc, gdc, consumed = _rls(data, pos, n * 4); pos += consumed
            if HAS_NP:
                f      = gdc / float(scale)
                ov, cv = (sc[0::4] * f).tolist(), (sc[3::4] * f).tolist()
                p1, p2 = (sc[1::4] * f).tolist(), (sc[2::4] * f).tolist()
                bull   = [cv[i] > ov[i] for i in range(n)]
                o = ov; c = cv
                h = [p2[i] if bull[i] else p1[i] for i in range(n)]
                l = [p1[i] if bull[i] else p2[i] for i in range(n)]
            else:
                for i in range(n):
                    ov = sc[i*4+0] * gdc / scale
                    cv = sc[i*4+3] * gdc / scale
                    p1 = sc[i*4+1] * gdc / scale
                    p2 = sc[i*4+2] * gdc / scale
                    o.append(ov); c.append(cv)
                    if cv > ov: l.append(p1); h.append(p2)
                    else:       h.append(p1); l.append(p2)
        elif tag == 3:
            sc, gdc, consumed = _rls(data, pos, n); pos += consumed
            v = (sc * gdc).tolist() if HAS_NP else [s * gdc for s in sc]
        elif tag == 4:
            sc, gdc, consumed = _rls(data, pos, n); pos += consumed
            oi = (sc * gdc).tolist() if HAS_NP else [s * gdc for s in sc]
        elif tag == 5:
            power = read_u32(data, pos); pos += 4
            scale = 10 ** power
            sc, gdc, consumed = _rls(data, pos, n); pos += consumed
            if HAS_NP:
                iv = (sc * gdc / scale).tolist()
            else:
                iv = [s * gdc / scale for s in sc]

    return {'symbol': symbol, 'timeframeSec': tfs,
            't': t, 'o': o, 'h': h, 'l': l, 'c': c, 'v': v, 'oi': oi, 'iv': iv}


def to_csv(mc: dict) -> str:
    has_v  = len(mc['v']) > 0
    has_oi = len(mc['oi']) > 0
    has_iv = len(mc.get('iv', [])) > 0
    cols   = ['time', 'open', 'high', 'low', 'close']
    if has_v:  cols.append('volume')
    if has_oi: cols.append('oi')
    if has_iv: cols.append('iv')
    rows = [','.join(cols)]
    for i in range(len(mc['t'])):
        row = [str(mc['t'][i]),
               f"{mc['o'][i]:.2f}", f"{mc['h'][i]:.2f}",
               f"{mc['l'][i]:.2f}", f"{mc['c'][i]:.2f}"]
        if has_v:  row.append(str(int(mc['v'][i])))
        if has_oi: row.append(str(int(mc['oi'][i])))
        if has_iv: row.append(f"{mc['iv'][i]:.4f}")
        rows.append(','.join(row))
    return '\n'.join(rows)


def bar(done: int, total: int) -> None:
    pct    = done / total if total else 0
    filled = int(40 * pct)
    b      = '█' * filled + '░' * (40 - filled)
    w      = len(str(total))
    print(f"\r[{b}] {done:{w}}/{total}", end='', flush=True)


def main():
    print("Price Unpacker — bit-packed OHLC binary zip decoder")
    print(f"numpy: {'yes — fast mode' if HAS_NP else 'not found — pip install numpy for 10x speed'}")
    print("=" * 52)

    zip_path = (sys.argv[1] if len(sys.argv) > 1
                else input("Binary zip path: ").strip().strip("'\""))

    if not os.path.isfile(zip_path):
        sys.exit(f"File not found: {zip_path}")

    fmt = input("Output format [json/csv] (default json): ").strip().lower()
    if fmt not in ('json', 'csv'):
        fmt = 'json'

    base     = os.path.splitext(os.path.basename(zip_path))[0]
    out_path = os.path.join(os.path.dirname(zip_path) or '.', f"{base}_{fmt}.zip")
    ext      = '.json' if fmt == 'json' else '.csv'

    print(f"\nInput : {zip_path}\nOutput: {out_path}\n")

    with zipfile.ZipFile(zip_path, 'r') as src:
        names = [n for n in src.namelist() if not n.endswith('/')]
        total = len(names)
        print(f"{total:,} entries\n")

        errors = []
        tick  = max(1, total // 100)
        with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as dst:
            for i, name in enumerate(names):
                if i % tick == 0 or i == total - 1:
                    bar(i + 1, total)
                try:
                    mc = decode_entry(src.read(name))
                    dst.writestr(name + ext,
                                 json.dumps(mc) if fmt == 'json' else to_csv(mc))
                except Exception as e:
                    errors.append((name, str(e)))

    print(f"\n\nDone → {out_path}")
    if errors:
        print(f"\n{len(errors)} error(s):")
        for nm, err in errors[:10]:
            print(f"  {nm}: {err}")
        if len(errors) > 10:
            print(f"  ... and {len(errors)-10} more")


if __name__ == '__main__':
    main()
