<script lang="ts">
    import { supabase } from '$lib/supabaseClient';
    import { goto } from '$app/navigation';
  
    let email = '';
    let password = '';
    let errorMsg = '';
  
    async function handleLogin() {
      errorMsg = '';
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
  
      if (error) {
        errorMsg = error.message;
      } else {
        // 로그인 성공 시 getSession() 호출하여 현재 세션 정보를 받아옵니다.
        const sessionResponse = await supabase.auth.getSession();
        if (sessionResponse.data.session) {
          // 고유한 activeSession ID 생성 (UUID 사용)
          const activeSession = crypto.randomUUID();
          // 로컬 스토리지에 activeSession 저장
          localStorage.setItem('activeSession', activeSession);
  
          const userId = sessionResponse.data.session.user.id;
          // profile 테이블의 active_session 컬럼 업데이트
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ active_session: activeSession })
            .eq('id', userId);
          if (updateError) {
            console.error("active_session 업데이트 실패:", updateError.message);
          }
        }
        // 로그인 성공 후 게임 화면(루트 경로)로 이동
        goto('/');
      }
    }
  </script>
  
  <h1>Login</h1>
  <label>
    Email:
    <input type="email" bind:value={email} />
  </label>
  <label>
    Password:
    <input type="password" bind:value={password} />
  </label>
  <button on:click|preventDefault={handleLogin}>Login</button>
  {#if errorMsg}
    <p style="color: red;">{errorMsg}</p>
  {/if}