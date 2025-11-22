import { Banner } from '@/components/banner'
import { CONFIG } from '@/constant/config'
import {
    DynamicDemo,
    dynamicCode,
    FeatureCard,
    HeartBeatingDemo,
    heartBeatingCode,
    LoopDelayDemo,
    loopDelayDemoCodeString,
    ParallelDemo,
    PerformanceDemo,
    PointerFollowingBalls,
    parallelCode,
    performanceCode,
    pointerFollowingCode,
    SequenceDemo,
    StaggerDemo,
    StatesDemo,
    sequenceCode,
    staggerCode,
    statesCode,
} from './components'

export default function HomePage() {
    return (
        <main className="flex size-full flex-col gap-y-12 overflow-x-hidden px-4 py-12">
            <Banner
                noAnimation={false}
                title={`${CONFIG.libName}.`}
                description="Tiny, but Powerful Declarative Animation Library."
                subDescription="Build complex, reusable, and performant animations with a compositional API."
                linkDescription="→ Get started"
                linkUrl={`/${CONFIG.majorLang}/docs`}
            />

            <div className="mt-16 grid size-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-2">
                <FeatureCard
                    title="Wow, Blazing-Fast"
                    description="Unlock frictionless, zero-overhead animations powered by the native Web Animation API."
                    link={`/${CONFIG.majorLang}/docs/core-api/web-timeline`}
                    code={performanceCode}
                >
                    <PerformanceDemo />
                </FeatureCard>

                <FeatureCard
                    title="Elegant State Management"
                    description="Manage complex UI states with declarative transitions."
                    link={`/${CONFIG.majorLang}/docs/core-api/states`}
                    code={statesCode}
                >
                    <StatesDemo />
                </FeatureCard>

                <FeatureCard
                    title="Dynamic Keyframes"
                    description="Drive animations with runtime values from user input keyframes."
                    link={`/${CONFIG.majorLang}/docs/core-api/advanced/dynamic-animations`}
                    code={dynamicCode}
                >
                    <DynamicDemo />
                </FeatureCard>

                <FeatureCard
                    title="Physics-Driven Spring Dynamics"
                    description="Create simulation based dynamic spring animations."
                    link={`/${CONFIG.majorLang}/docs/core-api/timing`}
                    code={pointerFollowingCode}
                >
                    <PointerFollowingBalls ballCount={9} />
                </FeatureCard>

                <FeatureCard
                    title="Sequence"
                    description="Chain animations together to run one after another."
                    link={`/${CONFIG.majorLang}/docs/core-api/sequence`}
                    code={sequenceCode}
                >
                    <SequenceDemo />
                </FeatureCard>

                <FeatureCard
                    title="Parallel"
                    description="Run multiple animations at the exact same time."
                    link={`/${CONFIG.majorLang}/docs/core-api/parallel`}
                    code={parallelCode}
                >
                    <ParallelDemo />
                </FeatureCard>

                <FeatureCard
                    title="Stagger"
                    description="Create cascading effects with a delay between animations."
                    link={`/${CONFIG.majorLang}/docs/core-api/stagger`}
                    code={staggerCode}
                >
                    <StaggerDemo />
                </FeatureCard>

                <FeatureCard
                    title="Loop & Delay"
                    code={loopDelayDemoCodeString}
                    description="Repeat animations and create pauses with ease."
                    link={`/${CONFIG.majorLang}/docs/core-api/loop`}
                >
                    <LoopDelayDemo />
                </FeatureCard>

                <FeatureCard
                    title="Open Source Crafted with Heart"
                    description="Create awesome product using ani and WebGL."
                    link={`/${CONFIG.majorLang}/docs/core-api/loop`}
                    code={heartBeatingCode}
                >
                    <HeartBeatingDemo />
                </FeatureCard>
            </div>
        </main>
    )
}
