import { createMDX } from 'fumadocs-mdx/next'

const withMdx = createMDX()

/** @type {import('next').NextConfig} */
const config = {
    // output: 'export', // static build

    reactStrictMode: true,
    serverExternalPackages: ['typescript', 'twoslash'],
}

export default withMdx(config)
