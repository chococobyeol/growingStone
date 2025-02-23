<script lang="ts">
	import { session } from '$lib/authStore';
	import { supabase } from '$lib/supabaseClient';
	import type { User, RealtimeChannel } from '@supabase/supabase-js';
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/stores';
	import '../lib/i18n';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
  
	let user: User | null = null;
	let logoutTriggered = false; // 로그아웃이 이미 실행되었는지 여부를 체크
  
	// store 구독을 통해 로그인 상태를 받아옴
	const unsubscribe = session.subscribe((currentSession) => {
	  user = currentSession ? currentSession.user : null;
	  // 세션이 사라지면 플래그 초기화
	  if (!currentSession) {
		logoutTriggered = false;
	  }
	});
  
	onDestroy(() => {
	  unsubscribe();
	});
  
	// 인증 전용 페이지 리스트
	const authRoutes = ['/login', '/register', '/guest'];
  
	async function logout() {
	  const { data: sessionData } = await supabase.auth.getSession();
	  if (!sessionData?.session) {
		// 세션이 없는 경우에도 클라이언트 상태를 강제로 초기화
		session.set(null);
		localStorage.removeItem('activeSession');
		goto('/');
		return;
	  }
	  if (activeSessionSubscription) {
		supabase.removeChannel(activeSessionSubscription);
	  }
	  const { error } = await supabase.auth.signOut();
	  if (error) {
		// 'Auth session missing!' 오류는 이미 세션이 없는 것으로 판단하여 무시
		if (error.message === 'Auth session missing!') {
		  console.warn("세션이 이미 만료되어 강제 로그아웃 처리합니다.");
		} else {
		  console.error("로그아웃 실패:", error.message);
		  return;
		}
	  }
	  // 클라이언트 상태 초기화 (세션, localStorage 등)
	  session.set(null);
	  localStorage.removeItem('activeSession');
	  goto('/');
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
			// logoutTriggered가 false일 때 한 번만 실행하도록 처리
			if (localActiveSession && localActiveSession !== newActiveSession && !logoutTriggered) {
			  logoutTriggered = true;
			  alert("다른 기기에서 로그인되었습니다. 현재 기기는 로그아웃됩니다.");
			  logout();
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

	// 추가: 폴링 기능을 통해 주기적으로 active_session 값을 체크
	onMount(() => {
	  const interval = setInterval(async () => {
		if (user) {
		  const { data: sessionData } = await supabase.auth.getSession();
		  if (!sessionData?.session?.user) return;
		  const userId = sessionData.session.user.id;
		  const { data: profileData, error } = await supabase
			.from('profiles')
			.select('active_session')
			.eq('id', userId)
			.single();
		  if (error) {
			console.error("프로필의 active_session 로드 실패:", error.message);
			return;
		  }
		  const newActiveSession = profileData.active_session;
		  const localActiveSession = localStorage.getItem('activeSession');
		  if (localActiveSession && localActiveSession !== newActiveSession && !logoutTriggered) {
			logoutTriggered = true;
			alert("다른 기기에서 로그인되었습니다. 현재 기기는 로그아웃됩니다.");
			logout();
		  }
		}
	  }, 5000); // 5초마다 체크

	  return () => {
		clearInterval(interval);
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