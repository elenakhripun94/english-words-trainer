import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlayerAssignment } from './api'
import { StudentPlayer } from './StudentPlayer'

const assignment: PlayerAssignment = {
  studentName: 'Маша',
  lesson: { title: 'Фрукты', topic: null, description: null, level: null, noText: true },
  items: [],
  exercises: [
    { type: 'memorize', position: 0, settings: {}, available: true },
    { type: 'listen_find', position: 1, settings: {}, available: true },
    { type: 'spell', position: 2, settings: {}, available: false },
  ],
  progress: [{ exercise: 'memorize', completed_at: '2026-10-16T10:00:00Z', unsupported: false }],
}

vi.mock('./api', () => ({ fetchAssignment: vi.fn(async () => assignment) }))
vi.mock('./sync', () => ({ flushOutbox: vi.fn(async () => undefined) }))

afterEach(cleanup)

describe('student home', () => {
  it('lists exercises by name in a lesson without text', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/s/token-token-token-token']}>
          <Routes>
            <Route path="/s/:token" element={<StudentPlayer />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Запомни')).toBeTruthy()
    expect(screen.getByText('Послушай и найди')).toBeTruthy()
    expect(screen.queryByText('Собери слово')).toBeNull()
    expect(screen.getByText(/Пройдено/)).toBeTruthy()
  })
})
