<script lang="ts">
	import { waitLocale } from 'svelte-i18n';
	import { session } from '$lib/authStore';
	import { supabase } from '$lib/supabaseClient';
	import type { User, RealtimeChannel } from '@supabase/supabase-js';
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/stores';
	import '../lib/i18n';
	import { t } from 'svelte-i18n';
	import { setLanguage } from '$lib/i18n';
	import { goto } from '$app/navigation';
  
	let localeReady = false;
	// 번역 리소스 로딩 완료될 때까지 기다립니다.
	waitLocale().then(() => {
	  localeReady = true;
	});
  
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
  
	// 인증 전용 페이지 리스트에서 '/guest' 제거
	const authRoutes = ['/login', '/register'];
  
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

{#if localeReady}
  <!-- 번역 리소스가 로드된 경우에만 화면 표시 -->
  {#if user || authRoutes.includes($page.url.pathname)}
    <!-- 로그인 상태이거나 인증 전용 페이지 방문 시: 해당 페이지 내용을 렌더링 -->
    <slot />
  {:else}
    <!-- 이외의 경우(예, 루트 경로("/")에 접근 시 user가 없으면) -->
    <div class="landing-page">
      <div class="landing-card">
        <h1 class="landing-title">
          <img src="/assets/icons/growstoneicon.png" alt="돌 키우기 아이콘" class="landing-icon" />
          <span>{$t('landingTitle')}</span>
        </h1>
        <p>{$t('landingDescription')}</p>
        <div class="landing-buttons">
          <a class="btn" href="/login">{$t('login')}</a>
          <a class="btn" href="/register">{$t('register')}</a>
        </div>
        <div class="language-settings">
          <span>{$t('languageSettingsTitle')}</span>
          <button class="btn" on:click={() => setLanguage('ko')}>{$t('korean')}</button>
          <button class="btn" on:click={() => setLanguage('en')}>{$t('english')}</button>
        </div>
      </div>
    </div>
  {/if}
{:else}
  <!-- 번역이 아직 로딩 중일 때 간단한 로딩 메시지 표시 -->
  <div>번역 로딩중...</div>
{/if}

<style>
  .landing-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #f9f9f9;
  }
  .landing-card {
    max-width: 400px;
    width: 90%;
    background: #fff;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    text-align: center;
  }
  .landing-title {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    margin-bottom: 1rem;
  }
 /* 타이틀 텍스트 오른쪽 여백 조정 */
  .landing-title span {
    margin-right: 3.8rem;
  }
  .landing-icon {
    width: 60px;
    height: 60px;
    margin-right: 1rem;
    vertical-align: middle;
  }
  .landing-card p {
    margin-bottom: 1.5rem;
    font-size: 1.1rem;
  }
  .landing-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .landing-buttons .btn {
    padding: 0.5rem 1rem;
    border: 1px solid #dddddd;
    background-color: #b7ddbf;
    color: #000;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
    margin: 0.5rem;
    font-size: 1rem;
    text-decoration: none;
    display: inline-block;
  }
  .landing-buttons .btn:hover {
    background-color: #a3cbb1;
  }
  .language-settings {
    margin-top: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
  .language-settings span {
    font-size: 1rem;
    font-weight: bold;
  }
  .language-settings .btn {
    padding: 0.5rem 1rem;
    border: 1px solid #dddddd;
    background-color: #b7ddbf;
    color: #000;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
    margin: 0;
    font-size: 1rem;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .language-settings .btn:hover {
    background-color: #a3cbb1;
  }
</style>