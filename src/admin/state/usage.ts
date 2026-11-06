import { useEffect, useState } from 'react'
import type { UsageResponse } from '../../shared/api'
import { request } from '../api'

// How close the site is to its plan's limits, read once a visit and shared by the notice at the top and Settings.
let cached: UsageResponse | null = null
const listeners = new Set<(usage: UsageResponse) => void>()

export async function refreshUsage(): Promise<UsageResponse> {
	const usage = await request<UsageResponse>('/usage')
	cached = usage
	for (const listener of listeners) listener(usage)
	return usage
}

export function useUsage(): UsageResponse | null {
	const [usage, setUsage] = useState(cached)
	useEffect(() => {
		listeners.add(setUsage)
		if (!cached) void refreshUsage().catch(() => {})
		return () => {
			listeners.delete(setUsage)
		}
	}, [])
	return usage
}
