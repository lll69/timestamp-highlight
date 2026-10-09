const p2 = n => String(n).padStart(2, "0");
const p3 = n => String(n).padStart(3, "0");
const regexNumber = /(0[xX][0-9A-Fa-f]+)|(0[oO][0-7]+)|(0[bB][01]+)|(\d+(\.\d+)?)/g;

export function formatUTC(t: number) {
    const d = new Date(t);
    const ms = d.getUTCMilliseconds();
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ` +
        `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}${ms ? `.${p3(ms)}` : ""}`;
}

export function formatLocal(t: number) {
    const d = new Date(t);
    const ms = d.getUTCMilliseconds();
    return `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ` +
        `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}${ms ? `.${p3(ms)}` : ""}`;
}

export function scanTokens(text: string, base: number) {
    const out: {
        from: number, to: number, raw: string,
    }[] = [];
    const regex = new RegExp(regexNumber);
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text))) {
        const raw = m[0];
        out.push({
            from: base + m.index,
            to: base + m.index + raw.length,
            raw,
        });
    }
    return out;
}

export function matchStamp(text: string, minMs: number, maxMs: number) {
    const n = Number(text);
    if (!Number.isFinite(n)) return null;
    const isSec = n >= (minMs / 1000) && n <= (maxMs / 1000);
    const isMs = n >= minMs && n <= maxMs;
    if (!isSec && !isMs) return null;
    return {
        isMs: isMs,
        isSec: isSec,
        num: n,
    };
}
