import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { Box } from '../cases/vue_box.ts'

/** The server-rendered markup of the B1 component. */
export function render(): Promise<string> {
    return renderToString(createSSRApp(Box))
}
