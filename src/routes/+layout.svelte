<script lang="ts">
	import { session } from '$lib/authStore';
	import { supabase } from '$lib/supabaseClient';
	import type { User } from '@supabase/supabase-js';
	import { onDestroy } from 'svelte';
	import { page } from '$app/stores';
  
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
	  await supabase.auth.signOut();
	}
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