import { IosLab } from '../../components/ios/lab'

export default async function IosPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const params = await searchParams
    const example =
        typeof params.example === 'string' ? params.example : 'ios-app-folder'
    return <IosLab initial={example} isolated={params.isolated === '1'} />
}
