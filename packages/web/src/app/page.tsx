import { redirect } from 'next/navigation'
import { CONFIG } from '@/constant/config'

export default function RootPage() {
    redirect(`/${CONFIG.majorLang}`)
}
