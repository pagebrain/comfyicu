import Image from 'next/image'
import { Inter } from 'next/font/google'


import { app } from '../components/app'

const inter = Inter({ subsets: ['latin'] })
import Script from 'next/script'

import { useRef, useState } from 'react'

function getPngMetadata(file) {
	return new Promise((r) => {
		const reader = new FileReader();
		reader.onload = (event) => {
			// Get the PNG data as a Uint8Array
			const pngData = new Uint8Array(event.target.result);
			const dataView = new DataView(pngData.buffer);

			// Check that the PNG signature is present
			if (dataView.getUint32(0) !== 0x89504e47) {
				console.error("Not a valid PNG file");
				r();
				return;
			}

			// Start searching for chunks after the PNG signature
			let offset = 8;
			let txt_chunks = {};
			// Loop through the chunks in the PNG file
			while (offset < pngData.length) {
				// Get the length of the chunk
				const length = dataView.getUint32(offset);
				// Get the chunk type
				const type = String.fromCharCode(...pngData.slice(offset + 4, offset + 8));
				if (type === "tEXt") {
					// Get the keyword
					let keyword_end = offset + 8;
					while (pngData[keyword_end] !== 0) {
						keyword_end++;
					}
					const keyword = String.fromCharCode(...pngData.slice(offset + 8, keyword_end));
					// Get the text
					const contentArraySegment = pngData.slice(keyword_end + 1, offset + 8 + length);
					const contentJson = Array.from(contentArraySegment).map(s => String.fromCharCode(s)).join('')
					txt_chunks[keyword] = contentJson;
				}

				offset += 12 + length;
			}

			r(txt_chunks);
		};

		reader.readAsArrayBuffer(file);
	});
}

import { useRouter } from 'next/navigation';
import Head from 'next/head'
export default function Home() {

	const [dragActive, setDragActive] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	const [errorMsg, setErrorMsg] = useState("");

	const router = useRouter();
	const inputRef = useRef(null);
	// handle drag events
	const handleDrag = function (e) {
		e.preventDefault();
		e.stopPropagation();
		if (e.type === "dragenter" || e.type === "dragover") {
			setDragActive(true);
		} else if (e.type === "dragleave") {
			setDragActive(false);
		}
	};
	// triggers when file is dropped
	const handleDrop = function (e) {
		e.preventDefault();
		e.stopPropagation();
		setDragActive(false);
		if (e.dataTransfer.files && e.dataTransfer.files[0]) {
			handleFile(e.dataTransfer.files);
		}
	};

	// triggers the input when the button is clicked
	const onButtonClick = (e) => {
		console.log("onButtonClick")
		inputRef.current.click();
		// e.preventDefault();
		// e.stopPropagation();
	};
	// triggers when file is selected with click
	const handleChange = function (e) {
		e.preventDefault();
		if (e.target.files && e.target.files[0]) {
			handleFile(e.target.files);
		}
	};

	async function uploadFile(image) {
		const body = new FormData();
		body.append("file", image);
		let data;
		try {
			const res = await fetch("/api/upload", {
				method: "POST",
				body
			});
			if (!res.ok) {
				throw new Error(await res.text())
			}
			data = await res.json();
		} catch (e) {
			console.log(e)
			setErrorMsg("Sorry, there was an error uploading file to server.")
			setIsLoading(false)
		}
		if (data && data.status == 'success') {
			router.push('/c/' + data.id)
		}
	}
	async function readJsonAsync(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();

			reader.onload = function (event) {
				try {
					const jsonData = JSON.parse(event.target.result);
					resolve(jsonData);
				} catch (error) {
					reject(error);
				}
			};

			reader.onerror = function () {
				reject(new Error('Error reading the file.'));
			};

			reader.readAsText(file);
		});
	}

	async function handleFile(files) {
		setErrorMsg("")
		setIsLoading(true);
		const image = files[0];
		// console.log(image)
		let metadata
		if (image.type == 'application/json') {
			try {
				await readJsonAsync(files[0])
			} catch (e) {
				setErrorMsg("Sorry, the JSON doesn't seem valid.")
				setIsLoading(false)
				console.log(e)
				return
			}
			await uploadFile(image);
			return
		} else if (image.type == 'image/png') {
			try {
				metadata = await getPngMetadata(image)
				console.log("metadata", metadata)
			} catch (e) {
				setErrorMsg("Sorry, there was an error parsing metadata, likely an invalid ComfyUI PNG was provided.")
				setIsLoading(false)
				console.log(e)
				return
			}
			if (!metadata || metadata === undefined || Object.keys(metadata).length === 0) {
				setErrorMsg("Sorry, there was an error parsing metadata, likely an invalid ComfyUI PNG was provided.")
				setIsLoading(false)
				return
			}
			await uploadFile(image);
			return
		} else {
			setErrorMsg("Sorry, invalid file format. Only valid ComfyUI JSON and PNG files are accepted.")
			setIsLoading(false)
			return
		}
	}
	function chunk(array, chunkSize = 4) {
		let out = []
		for (let i = 0; i < array.length; i += chunkSize) {
			const chunk = array.slice(i, i + chunkSize);
			out.push(chunk)
		}
		return out
	}
	const gallery = chunk(['tEWtAo9I', 'J7PoFyoP', 'J4DkJw', 'm6gsndMM', 'oedBJX5D', 'cPJUO3I', 'bjKyjhc', 'b3qRKKxv', 'TRQ9jgI', 'oWO9Dg', 'SNZ2Mw', 'PMclP3ig6A', 'NFAQImM', 'LjOSql4A', 'HU-LWvlxaQ', 'ILxsNPM'].map(e => {
		return {
			url: '/c/' + e,
			img: 'https://img.comfy.icu/sig/width:250/quality:85/' + btoa('https://r2.comfy.icu/' + e + '.png') + '.webp'

		}
	}))

	return (
		<>
			<Head>
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<meta name="twitter:card" content="summary_large_image" />
				<meta name="twitter:title" content="ComfyICU" />
				<meta name="twitter:description" content="Imgur for sharing ComfyUI workflows" />
				<meta name="twitter:image" content="https://comfy.icu/comfyui.webp" />
				<meta property="og:title" content="ComfyICU" />
				<meta property="og:description" content="Imgur for sharing ComfyUI workflows" />
				<meta property="og:image" content="https://comfy.icu/comfyui.webp" />
			</Head>
			<div
				className={`flex min-h-screen flex-col items-center p-24 ${inter.classNameName}`}
			>
				<div className='text-center'>
					<h1 className='text-6xl font-semibold text-white-900'><span>Comfy</span>.ICU</h1>
					<h3 className='text-2xl text-white-700 py-8'>Imgur for sharing ComfyUI workflows</h3>
				</div>
				<div className='mb-10 py-10 relative'>
					{errorMsg != "" &&
						<div className='text-red-500 py-2'>{errorMsg}</div>
					}
					{!isLoading &&
						<form id="form-file-upload" onDragEnter={handleDrag} onSubmit={(e) => e.preventDefault()} >
							<input ref={inputRef} type="file" id="input-file-upload" multiple={false} onChange={handleChange} accept="image/png,application/json" />
							<label id="label-file-upload" htmlFor="input-file-upload" className={dragActive ? "drag-active" : ""}>
								<div>
									<p>Drag and drop or click to upload ComfyUI PNG or JSON</p>
								</div>
							</label>
							{dragActive && <div id="drag-file-element" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}></div>}
						</form>
					}
					{isLoading &&
						<div className="simple-spinner">
							<span></span>
						</div>}
				</div>

				<div className='mb-10'>
					<div className="gap-4 columns-1 sm:columns-2 md:columns-4">
						{gallery.map((f, j) => (
							<div key={j} className="">
								{f.map((e, i) => (
									<a key={i} href={e.url}><img className='rounded-lg mb-4 w-full' src={e.img} loading="lazy" /></a>
								)
								)}
							</div>
						))}
					</div>
				</div>


				<footer className="flex h-[80px] items-center justify-center text-center">

					<a className="rounded-sm outline-none transition-transform duration-200 ease-in-out text-slate-12 hover:text-slate-10  inline-flex items-center gap-2" target="_blank" href="https://github.com/pagebrain/comfyicu">Github</a>

				</footer>
			</div>
		</>
	)
}
