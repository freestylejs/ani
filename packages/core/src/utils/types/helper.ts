export type PartialRecord<K extends keyof any, T> = {
    [P in K]?: T
}

export type Capitalize<T extends string> = T extends `${infer R}${infer Rest}`
    ? `${Uppercase<R>}${Rest}`
    : never

export type WithPrefix<
    Prefix extends string,
    T extends string,
> = `${Prefix}${T}`

export type Prettify<T> = { [K in keyof T]: T[K] } & {}

export type UnionToIntersection<Union> = (
    Union extends any
        ? (k: Union) => void
        : never
) extends (k: infer I) => void
    ? I
    : never

export type WithLiteral<Literal extends string> = Literal | (string & {})

export type WithLiteralRecord<Literal extends string, Value> = {
    [key: string]: Value
} & {
    [Key in Literal]?: Value
}
