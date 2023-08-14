class ComfyApi extends EventTarget {
	#registered = new Set();

	constructor() {
		super();
		this.api_host = location.host;
		this.api_base = location.pathname.split('/').slice(0, -1).join('/');
	}

	apiURL(route) {
		return this.api_base + route;
	}

	fetchApi(route, options) {
		return fetch(route, options);
	}

	addEventListener(type, callback, options) {
		// super.addEventListener(type, callback, options);
		this.#registered.add(type);
	}

	/**
	 * Poll status  for colab and other things that don't support websockets.
	 */
	#pollQueue() {
		setInterval(async () => {
			try {
				const resp = await this.fetchApi("/prompt");
				const status = await resp.json();
				this.dispatchEvent(new CustomEvent("status", { detail: status }));
			} catch (error) {
				this.dispatchEvent(new CustomEvent("status", { detail: null }));
			}
		}, 1000);
	}

	/**
	 * Creates and connects a WebSocket for realtime updates
	 * @param {boolean} isReconnect If the socket is connection is a reconnect attempt
	 */
	#createSocket(isReconnect) {
		if (this.socket) {
			return;
		}

		let opened = false;
		let existingSession = window.name;
		if (existingSession) {
			existingSession = "?clientId=" + existingSession;
		}
		this.socket = new WebSocket(
			`ws${window.location.protocol === "https:" ? "s" : ""}://${this.api_host}${this.api_base}/ws${existingSession}`
		);
		this.socket.binaryType = "arraybuffer";

		this.socket.addEventListener("open", () => {
			opened = true;
			if (isReconnect) {
				this.dispatchEvent(new CustomEvent("reconnected"));
			}
		});

		this.socket.addEventListener("error", () => {
			if (this.socket) this.socket.close();
			if (!isReconnect && !opened) {
				this.#pollQueue();
			}
		});

		this.socket.addEventListener("close", () => {
			setTimeout(() => {
				this.socket = null;
				this.#createSocket(true);
			}, 300);
			if (opened) {
				this.dispatchEvent(new CustomEvent("status", { detail: null }));
				this.dispatchEvent(new CustomEvent("reconnecting"));
			}
		});

		this.socket.addEventListener("message", (event) => {
			try {
				if (event.data instanceof ArrayBuffer) {
					const view = new DataView(event.data);
					const eventType = view.getUint32(0);
					const buffer = event.data.slice(4);
					switch (eventType) {
					case 1:
						const view2 = new DataView(event.data);
						const imageType = view2.getUint32(0)
						let imageMime
						switch (imageType) {
							case 1:
							default:
								imageMime = "image/jpeg";
								break;
							case 2:
								imageMime = "image/png"
						}
						const imageBlob = new Blob([buffer.slice(4)], { type: imageMime });
						this.dispatchEvent(new CustomEvent("b_preview", { detail: imageBlob }));
						break;
					default:
						throw new Error(`Unknown binary websocket message of type ${eventType}`);
					}
				}
				else {
				    const msg = JSON.parse(event.data);
				    switch (msg.type) {
					    case "status":
						    if (msg.data.sid) {
							    this.clientId = msg.data.sid;
							    window.name = this.clientId;
						    }
						    this.dispatchEvent(new CustomEvent("status", { detail: msg.data.status }));
						    break;
					    case "progress":
						    this.dispatchEvent(new CustomEvent("progress", { detail: msg.data }));
						    break;
					    case "executing":
						    this.dispatchEvent(new CustomEvent("executing", { detail: msg.data.node }));
						    break;
					    case "executed":
						    this.dispatchEvent(new CustomEvent("executed", { detail: msg.data }));
						    break;
					    case "execution_start":
						    this.dispatchEvent(new CustomEvent("execution_start", { detail: msg.data }));
						    break;
					    case "execution_error":
						    this.dispatchEvent(new CustomEvent("execution_error", { detail: msg.data }));
						    break;
					    case "execution_cached":
						    this.dispatchEvent(new CustomEvent("execution_cached", { detail: msg.data }));
						    break;
					    default:
						    if (this.#registered.has(msg.type)) {
							    this.dispatchEvent(new CustomEvent(msg.type, { detail: msg.data }));
						    } else {
							    throw new Error(`Unknown message type ${msg.type}`);
						    }
				    }
				}
			} catch (error) {
				console.warn("Unhandled message:", event.data, error);
			}
		});
	}

	/**
	 * Initialises sockets and realtime updates
	 */
	init() {
		this.#createSocket();
	}

	/**
	 * Gets a list of extension urls
	 * @returns An array of script urls to import
	 */
	async getExtensions() {
		const resp = await this.fetchApi("/extensions.js", { cache: "no-store" });
		return await resp.json();
	}

	/**
	 * Gets a list of embedding names
	 * @returns An array of script urls to import
	 */
	async getEmbeddings() {
		const resp = await this.fetchApi("/embeddings", { cache: "no-store" });
		return await resp.json();
	}

	/**
	 * Loads node object definitions for the graph
	 * @returns The node definitions
	 */
	async getNodeDefs() {
		const resp = await this.fetchApi("/object_info.json", { cache: "no-store" });
		return await resp.json();
	}

	/**
	 *
	 * @param {number} number The index at which to queue the prompt, passing -1 will insert the prompt at the front of the queue
	 * @param {object} prompt The prompt data to queue
	 */
	async queuePrompt(number, { output, workflow }) {
		const body = {
			client_id: this.clientId,
			prompt: output,
			extra_data: { extra_pnginfo: { workflow } },
		};

		if (number === -1) {
			body.front = true;
		} else if (number != 0) {
			body.number = number;
		}

		const res = await this.fetchApi("/prompt", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (res.status !== 200) {
			throw {
				response: await res.json(),
			};
		}

		return await res.json();
	}

	/**
	 * Loads a list of items (queue or history)
	 * @param {string} type The type of items to load, queue or history
	 * @returns The items of the specified type grouped by their status
	 */
	async getItems(type) {
		if (type === "queue") {
			return this.getQueue();
		}
		return this.getHistory();
	}

	/**
	 * Gets the current state of the queue
	 * @returns The currently running and queued items
	 */
	async getQueue() {
		try {
			const res = await this.fetchApi("/queue");
			const data = await res.json();
			return {
				// Running action uses a different endpoint for cancelling
				Running: data.queue_running.map((prompt) => ({
					prompt,
					remove: { name: "Cancel", cb: () => api.interrupt() },
				})),
				Pending: data.queue_pending.map((prompt) => ({ prompt })),
			};
		} catch (error) {
			console.error(error);
			return { Running: [], Pending: [] };
		}
	}

	/**
	 * Gets the prompt execution history
	 * @returns Prompt history including node outputs
	 */
	async getHistory() {
		try {
			const res = await this.fetchApi("/history");
			return { History: Object.values(await res.json()) };
		} catch (error) {
			console.error(error);
			return { History: [] };
		}
	}

	/**
	 * Sends a POST request to the API
	 * @param {*} type The endpoint to post to
	 * @param {*} body Optional POST data
	 */
	async #postItem(type, body) {
		try {
			await this.fetchApi("/" + type, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: body ? JSON.stringify(body) : undefined,
			});
		} catch (error) {
			console.error(error);
		}
	}

	/**
	 * Deletes an item from the specified list
	 * @param {string} type The type of item to delete, queue or history
	 * @param {number} id The id of the item to delete
	 */
	async deleteItem(type, id) {
		await this.#postItem(type, { delete: [id] });
	}

	/**
	 * Clears the specified list
	 * @param {string} type The type of list to clear, queue or history
	 */
	async clearItems(type) {
		await this.#postItem(type, { clear: true });
	}

	/**
	 * Interrupts the execution of the running prompt
	 */
	async interrupt() {
		await this.#postItem("interrupt", null);
	}
}

export const api = new ComfyApi();
