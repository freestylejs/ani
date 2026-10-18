import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Box } from '../cases/react_box.ts'

/** The server-rendered markup of the B1 component. */
export function render(): string {
    return renderToString(createElement(Box))
}
