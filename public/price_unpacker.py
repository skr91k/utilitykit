#!/usr/bin/env python3
"""
Price Unpacker — decode bit-packed OHLC binary zip entries.
Port of BahvRepo4.byteArrayToresponseMC (Kotlin). https://gist.github.com/skr91k/9f435d4eea333943b6a03d34f0bd2280

Usage:
    python price_unpacker.py [zip_file]
"""

import zipfile, json, os, sys, math, io

try:
    import numpy as np
    HAS_NP = True
except ImportError:
    HAS_NP = False

try:
    import pyarrow as pa
    import pyarrow.parquet as pq
    HAS_PA = True
except ImportError:
    HAS_PA = False

def _ensure_pyarrow():
    global pa, pq, HAS_PA
    if HAS_PA:
        return True
    print("pyarrow not found — installing...")
    try:
        import subprocess
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pyarrow'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        import pyarrow as pa
        import pyarrow.parquet as pq
        HAS_PA = True
        print("pyarrow installed successfully.\n")
        return True
    except Exception as e:
        print(f"Auto-install failed: {e}")
        print("Run manually: pip install pyarrow")
        return False


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


def to_parquet(mc: dict) -> bytes:
    """Serialize a decoded OHLC dict to Parquet bytes (snappy compressed)."""
    n = len(mc['t'])

    def _f32(lst):
        return pa.array(lst, type=pa.float32()) if lst else pa.array([None] * n, type=pa.float32())

    def _i64(lst):
        return pa.array([int(x) for x in lst], type=pa.int64()) if lst else pa.array([None] * n, type=pa.int64())

    arrays = [
        pa.array(mc['t'], type=pa.int64()),   # unix epoch seconds
        _f32(mc['o']),
        _f32(mc['h']),
        _f32(mc['l']),
        _f32(mc['c']),
    ]
    fields = [
        pa.field('time',  pa.int64()),
        pa.field('open',  pa.float32()),
        pa.field('high',  pa.float32()),
        pa.field('low',   pa.float32()),
        pa.field('close', pa.float32()),
    ]

    if mc['v']:
        arrays.append(_i64(mc['v']))
        fields.append(pa.field('volume', pa.int64()))
    if mc['oi']:
        arrays.append(_i64(mc['oi']))
        fields.append(pa.field('oi', pa.int64()))
    if mc.get('iv'):
        arrays.append(_f32(mc['iv']))
        fields.append(pa.field('iv', pa.float32()))

    # store symbol + timeframe as schema-level metadata
    meta = {
        b'symbol':        mc['symbol'].encode(),
        b'timeframeSec':  str(mc['timeframeSec']).encode(),
    }
    schema = pa.schema(fields, metadata=meta)
    table  = pa.table({f.name: arr for f, arr in zip(fields, arrays)}, schema=schema)

    buf = io.BytesIO()
    pq.write_table(table, buf, compression='snappy')
    return buf.getvalue()


def find_day_high(mc: dict):
    """Return (timestamp, high_price) of the session-high candle.
    Add strategies here — e.g. check volume confirmation, gap-up, etc."""
    if not mc['h']:
        return None, None
    if HAS_NP:
        idx = int(np.argmax(mc['h']))
    else:
        idx = max(range(len(mc['h'])), key=mc['h'].__getitem__)
    return mc['t'][idx], mc['h'][idx]


def run_demo(zip_path: str, max_count):
    """Demo Backtest : Print day high for every entry — no files written, strategy sandbox."""
    with zipfile.ZipFile(zip_path, 'r') as src:
        names = [n for n in src.namelist() if not n.endswith('/')]
        if max_count is not None:
            names = names[:max_count]
        #print(f"\n  {'Entry':<40} {'Day High':>10}  {'Timestamp':>12}")
        #print('  ' + '-' * 66)
        for name in names:
            try:
                mc  = decode_entry(src.read(name))
                ts, high = find_day_high(mc)
                high_s = f"{high:.2f}" if high is not None else 'N/A'
                ts_s   = str(ts)        if ts   is not None else 'N/A'
                #print(f"  {name:<40} {high_s:>10}  {ts_s:>12}")
            except Exception as e:
                print(f"  {name:<40} ERROR: {e}")


def bar(done: int, total: int) -> None:
    pct    = done / total if total else 0
    filled = int(40 * pct)
    b      = '█' * filled + '░' * (40 - filled)
    w      = len(str(total))
    print(f"\r[{b}] {done:{w}}/{total}", end='', flush=True)


def process_zip(zip_path: str, fmt: str, ext: str, zip_compress, zip_level, max_count):
    """Process a single zip file and write output next to it."""
    base     = os.path.splitext(os.path.basename(zip_path))[0]
    out_path = os.path.join(os.path.dirname(zip_path) or '.', f"{base}_{fmt}.zip")

    print(f"\nInput : {zip_path}\nOutput: {out_path}")

    with zipfile.ZipFile(zip_path, 'r') as src:
        names = [n for n in src.namelist() if not n.endswith('/')]
        if max_count is not None:
            names = names[:max_count]
        total = len(names)
        print(f"{total:,} entries")

        errors = []
        tick   = max(1, total // 100)
        kwargs = {'compression': zip_compress}
        if zip_level is not None:
            kwargs['compresslevel'] = zip_level

        with zipfile.ZipFile(out_path, 'w', **kwargs) as dst:
            for i, name in enumerate(names):
                if i % tick == 0 or i == total - 1:
                    bar(i + 1, total)
                try:
                    mc = decode_entry(src.read(name))
                    if fmt == 'json':
                        dst.writestr(name + ext, json.dumps(mc))
                    elif fmt == 'csv':
                        dst.writestr(name + ext, to_csv(mc))
                    else:  # parquet
                        dst.writestr(name + ext, to_parquet(mc))
                except Exception as e:
                    errors.append((name, str(e)))

    print(f"\n  Done → {out_path}")
    if errors:
        print(f"  {len(errors)} error(s):")
        for nm, err in errors[:10]:
            print(f"    {nm}: {err}")
        if len(errors) > 10:
            print(f"    ... and {len(errors)-10} more")
    return errors


def main():
    print("Price Unpacker — bit-packed OHLC binary zip decoder")
    print(f"numpy  : {'yes — fast mode' if HAS_NP else 'not found — pip install numpy for 10x speed'}")
    print(f"pyarrow: {'yes — parquet enabled' if HAS_PA else 'not found — pip install pyarrow for parquet output'}")
    print("=" * 52)

    inp = (sys.argv[1] if len(sys.argv) > 1
           else input("Zip file or folder path: ").strip().strip("'\""))

    # Resolve zip files to process
    if os.path.isdir(inp):
        zip_files = sorted(
            os.path.join(inp, f) for f in os.listdir(inp)
            if f.lower().endswith('.zip')
        )
        if not zip_files:
            sys.exit(f"No .zip files found in folder: {inp}")
        print(f"Found {len(zip_files)} zip file(s) in folder.")
    elif os.path.isfile(inp):
        zip_files = [inp]
    else:
        sys.exit(f"Path not found: {inp}")

    valid_fmts = ['json', 'csv', 'parquet', 'demo']
    fmt = input("Mode — convert: [json/csv/parquet]  run code: [demo]  (default demo): ").strip().lower()
    if fmt not in valid_fmts:
        fmt = 'demo'

    if fmt == 'parquet' and not _ensure_pyarrow():
        sys.exit("Cannot proceed without pyarrow.")

    max_count_raw = input("Max entries per zip [all]: ").strip().lower()
    if max_count_raw in ('', 'all'):
        max_count = None
    else:
        try:
            max_count = int(max_count_raw)
            if max_count <= 0:
                raise ValueError
        except ValueError:
            print("Invalid number — processing all entries.")
            max_count = None

    total_files = len(zip_files)

    if fmt == 'demo':
        for idx, zp in enumerate(zip_files, 1):
            print(f"\n[{idx}/{total_files}] {os.path.basename(zp)}")
            run_demo(zp, max_count)
        print(f"\n{'='*52}")
        print(f"Demo done. {total_files} file(s) scanned.")
        return

    ext          = {'json': '.json', 'csv': '.csv', 'parquet': '.parquet'}[fmt]
    zip_compress = zipfile.ZIP_STORED if fmt == 'parquet' else zipfile.ZIP_DEFLATED
    zip_level    = None if fmt == 'parquet' else 6

    all_errors   = 0
    for idx, zp in enumerate(zip_files, 1):
        print(f"\n[{idx}/{total_files}] {os.path.basename(zp)}")
        errs = process_zip(zp, fmt, ext, zip_compress, zip_level, max_count)
        all_errors += len(errs)

    print(f"\n{'='*52}")
    print(f"All done. {total_files} file(s) processed, {all_errors} total error(s).")


if __name__ == '__main__':
    main()