/** React renderings of the shared scene chrome (the kit builds DOM nodes). */

import type { ReactElement } from 'react'

export function IosStatus({
    time = '9:41',
}: {
    readonly time?: string
}): ReactElement {
    return (
        <div className="ios-status">
            <span className="ios-status-time">{time}</span>
            <span className="ios-status-right">
                <svg
                    width="18"
                    height="12"
                    viewBox="0 0 18 12"
                    aria-hidden="true"
                >
                    <rect
                        x="0"
                        y="7"
                        width="3"
                        height="5"
                        rx="0.7"
                        fill="currentColor"
                    />
                    <rect
                        x="4.5"
                        y="5"
                        width="3"
                        height="7"
                        rx="0.7"
                        fill="currentColor"
                    />
                    <rect
                        x="9"
                        y="2.5"
                        width="3"
                        height="9.5"
                        rx="0.7"
                        fill="currentColor"
                    />
                    <rect
                        x="13.5"
                        y="0"
                        width="3"
                        height="12"
                        rx="0.7"
                        fill="currentColor"
                    />
                </svg>
                <svg
                    width="25"
                    height="12"
                    viewBox="0 0 25 12"
                    aria-hidden="true"
                >
                    <rect
                        x="0.5"
                        y="1"
                        width="21"
                        height="10"
                        rx="2.5"
                        fill="none"
                        stroke="currentColor"
                        strokeOpacity="0.4"
                    />
                    <rect
                        x="2"
                        y="2.5"
                        width="15"
                        height="7"
                        rx="1.3"
                        fill="currentColor"
                    />
                    <path
                        d="M23 4v4a2 2 0 0 0 0-4Z"
                        fill="currentColor"
                        fillOpacity="0.4"
                    />
                </svg>
            </span>
        </div>
    )
}

export function HomeIndicator(): ReactElement {
    return <div className="ios-home" />
}
