import Link from "next/link";

export default function Footer(){
    return (<footer className="flex h-[80px] items-center justify-center text-center">

    <Link className="rounded-sm outline-none transition-transform duration-200 ease-in-out text-slate-12 hover:text-slate-10  inline-flex items-center gap-2" target="_blank" href="https://github.com/pagebrain/comfyicu">Github</Link>

</footer>)
}
Footer.displayName = 'Footer';