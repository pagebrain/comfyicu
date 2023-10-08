import Link from 'next/link'
import { popupCenter } from '@/lib/utils'
import { signOut } from "next-auth/react"
export default function NavBar({session, status, menu}){
    return(<div style={{ zIndex: 1000 }} className="supports-backdrop-blur:bg-white/60 sticky top-0 z-40 w-full flex-none bg-white/95 backdrop-blur transition-colors duration-500 dark:border-slate-50/[0.06] dark:bg-transparent lg:z-50 lg:border-b lg:border-slate-900/10">
    <div className="max-w-8xl mx-auto mx-4 border-b border-slate-900/10 py-4 dark:border-slate-300/10 lg:mx-0 lg:border-0 p-4 sm:px-6 md:px-8 lg:px-10">

        <div className="flex flex-wrap items-center justify-between mx-auto">
          <Link className="mr-3 flex-none overflow-hidden md:w-auto font-semibold" href="/"><span className='blue'>Comfy</span>.ICU</Link>
          {menu && menu}
      {status === "authenticated" && <div className='flex'>
      <img className='w-8 h-8 rounded-full mr-4' alt={session.user.name} src={session.user.image}/>
      <button onClick={() => signOut()}>Logout</button>
    </div>}
    {status === "unauthenticated" && <div>
      <button onClick={() => popupCenter("/login", "Login")} >Login</button>
    </div>}
   
        </div>
      </div>
    </div>)
}
NavBar.displayName = 'NavBar';
