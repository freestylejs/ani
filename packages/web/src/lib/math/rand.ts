export const rand = (arg: [min: number, max: number]) =>
    Math.min(Math.max(Math.floor(Math.random() * arg[1]), arg[0]), arg[1])
