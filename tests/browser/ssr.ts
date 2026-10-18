import { fileURLToPath } from 'node:url'
import { bundleForNode } from './bundle.ts'

interface SsrModule {
    render(): string | Promise<string>
}

/**
 * Renders the B1 component of `framework` to a string in Node. Any warning
 * or error the renderer logs fails the render.
 */
export async function renderToMarkup(
    framework: 'react' | 'vue'
): Promise<string> {
    const entry = fileURLToPath(
        new URL(`./ssr/${framework}.ts`, import.meta.url)
    )
    const code = await bundleForNode(entry)
    const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    const module: SsrModule = await import(url)

    const logged: string[] = []
    const { error, warn } = console
    console.error = (...args: unknown[]) => void logged.push(args.join(' '))
    console.warn = (...args: unknown[]) => void logged.push(args.join(' '))
    try {
        const markup = await module.render()
        if (logged.length > 0) {
            throw new Error(
                `${framework} server rendering logged: ${logged.join(' | ')}`
            )
        }
        return markup
    } finally {
        console.error = error
        console.warn = warn
    }
}
