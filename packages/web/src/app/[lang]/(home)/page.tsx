import { Banner } from '@/components/banner'
import { CONFIG } from '@/constant/config'
import {
    DynamicDemo,
    FeatureCard,
    LoopDelayDemo,
    ParallelDemo,
    SequenceDemo,
    StaggerDemo,
    StatesDemo,
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
                    title="Sequence"
                    description="Chain animations together to run one after another."
                    link={`/${CONFIG.majorLang}/docs/core-api/sequence`}
                >
                    <SequenceDemo />
                </FeatureCard>

                <FeatureCard
                    title="Parallel"
                    description="Run multiple animations at the exact same time."
                    link={`/${CONFIG.majorLang}/docs/core-api/parallel`}
                >
                    <ParallelDemo />
                </FeatureCard>

                <FeatureCard
                    title="Stagger"
                    description="Create cascading effects with a delay between animations."
                    link={`/${CONFIG.majorLang}/docs/core-api/stagger`}
                >
                    <StaggerDemo />
                </FeatureCard>

                <FeatureCard
                    title="Dynamic & Interactive"
                    description="Drive animations with runtime values from user input."
                    link={`/${CONFIG.majorLang}/docs/core-api/advanced/dynamic-animations`}
                >
                    <DynamicDemo />
                </FeatureCard>

                <FeatureCard
                    title="Loop & Delay"
                    description="Repeat animations and create pauses with ease."
                    link={`/${CONFIG.majorLang}/docs/core-api/loop`}
                >
                    <LoopDelayDemo />
                </FeatureCard>

                <FeatureCard
                    title="States"
                    description="Manage complex UI states with declarative transitions."
                    link={`/${CONFIG.majorLang}/docs/core-api/states`}
                >
                    <StatesDemo />
                </FeatureCard>
            </div>
        </main>
    )
}
