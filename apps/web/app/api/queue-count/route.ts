import { type NextRequest, NextResponse } from 'next/server'
import { extractGuestId } from '@/lib/api/guest-session'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  // Get guest ID from cookie
  const guestId = extractGuestId(request)

  if (!guestId) {
    return NextResponse.json({ count: 0, firstSessionToken: null })
  }

  try {
    // Count sessions that are ready to take (user can actually interact with them)
    const { data, error, count } = await supabase
      .from('sessions')
      .select('session_token', { count: 'exact' })
      .eq('user_id', guestId)
      .eq('status', 'ready')
      .in('study_status', ['not_started', 'curiosity_in_progress'])
      .order('created_at', { ascending: true })
      .limit(1)

    if (error) {
      console.error('Failed to get queue count:', error)
      return NextResponse.json({ count: 0, firstSessionToken: null })
    }

    const firstSessionToken = data && data.length > 0 ? data[0].session_token : null

    return NextResponse.json({ count: count ?? 0, firstSessionToken })
  } catch (error) {
    console.error('Failed to get queue count:', error)
    return NextResponse.json({ count: 0, firstSessionToken: null })
  }
}
