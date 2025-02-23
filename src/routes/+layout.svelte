<script lang="ts">
	import { session } from '$lib/authStore';
	import { supabase } from '$lib/supabaseClient';
	import type { User, RealtimeChannel } from '@supabase/supabase-js';
	import { onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import '../lib/i18n';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
  
	let user: User | null = null;
  
	// store 구독을 통해 로그인 상태를 받아옴
	const unsubscribe = session.subscribe((currentSession) => {
	  user = currentSession ? currentSession.user : null;
	});
  
	onDestroy(() => {
	  unsubscribe();
	});
  
	// 인증 전용 페이지 리스트
	const authRoutes = ['/login', '/register', '/guest'];
  
	async function logout() {
	  const { data: sessionData } = await supabase.auth.getSession();
	  if (!sessionData?.session) {
		// 이미 세션이 없으면 바로 로그인 페이지로 이동
		goto('/login');
		return;
	  }
	  const { error } = await supabase.auth.signOut();
	  if (error) {
		console.error("로그아웃 실패:", error.message);
	  }
	  goto('/login');
	}
  
	// activeSessionSubscription 변수의 타입을 명시합니다.
	let activeSessionSubscription: RealtimeChannel | null = null;
  
	$: if (user) {
	  const userId = user.id;
	  activeSessionSubscription = supabase
		.channel('active-session')
		.on(
		  'postgres_changes',
		  {
			event: 'UPDATE',
			schema: 'public',
			table: 'profiles',
			filter: `id=eq.${userId}`
		  },
		  (payload: any) => {
			const newActiveSession = payload.new.active_session;
			const localActiveSession = localStorage.getItem('activeSession');
			if (localActiveSession && localActiveSession !== newActiveSession) {
			  alert("다른 기기에서 로그인되었습니다. 현재 기기는 로그아웃됩니다.");
			  logout();
			  goto('/login');
			}
		  }
		)
		.subscribe();
	} else {
	  // user가 없을 때 기존 구독이 있다면 구독 해제
	  if (activeSessionSubscription) {
		supabase.removeChannel(activeSessionSubscription);
	  }
	}
  
	onDestroy(() => {
	  if (activeSessionSubscription) {
		supabase.removeChannel(activeSessionSubscription);
	  }
	});
</script>

{#if user || authRoutes.includes($page.url.pathname)}
  <!-- 로그인 상태이거나 인증 전용 페이지 방문 시: 해당 페이지 내용을 렌더링 -->
  <slot />
{:else}
  <!-- 이외의 경우(예, 루트 경로("/")에 접근 시 user가 없으면) -->
  <div class="auth-container">
    <h1>Growing Stone</h1>
    <p>grow your stone...</p>
    <div class="auth-buttons">
      <a class="btn" href="/login">Login</a>
      <a class="btn" href="/register">Register</a>
      <a class="btn" href="/guest">Continue as Guest</a>
    </div>
  </div>
{/if}

<style>
  .auth-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    text-align: center;
  }
  .auth-buttons {
    margin-top: 1rem;
    display: flex;
    gap: 1rem;
  }
  .btn {
    padding: 0.5rem 1rem;
    background: #0070f3;
    color: #fff;
    text-decoration: none;
    border-radius: 4px;
  }
</style>