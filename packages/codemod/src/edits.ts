interface Edit {
    start: number
    end: number
    text: string
}

/**
 * A set of text edits at source positions. Edits nested inside a later
 * `replace` are dropped; the replacement is expected to carry their result
 * (see `render`).
 */
export class EditSet {
    private edits: Edit[] = []

    constructor(private readonly source: string) {}

    replace(start: number, end: number, text: string): void {
        this.edits = this.edits.filter((e) => e.start < start || e.end > end)
        this.edits.push({ start, end, text })
    }

    insert(pos: number, text: string): void {
        this.edits.push({ start: pos, end: pos, text })
    }

    /** The source between `start` and `end` with the edits inside it applied. */
    render(start: number, end: number): string {
        const inside = this.edits.filter(
            (e) => e.start >= start && e.end <= end
        )
        return this.apply(inside, start, end)
    }

    /** The whole source with every edit applied. */
    result(): string {
        return this.apply(this.edits, 0, this.source.length)
    }

    private apply(edits: Edit[], from: number, to: number): string {
        const sorted = edits
            .map((edit, seq) => ({ edit, seq }))
            .sort(
                (a, b) =>
                    a.edit.start - b.edit.start ||
                    a.edit.end - b.edit.end ||
                    a.seq - b.seq
            )
        let out = ''
        let cursor = from
        for (const { edit } of sorted) {
            if (edit.start < cursor) continue
            out += this.source.slice(cursor, edit.start) + edit.text
            cursor = edit.end
        }
        return out + this.source.slice(cursor, to)
    }
}
