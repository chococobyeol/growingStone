<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { goto } from '$app/navigation';
  import { currentStone } from '$lib/stoneStore';
  import { get } from 'svelte/store';

  // DB에 저장된 돌 데이터 타입 (DB의 size는 현재 돌의 baseSize에 해당)
  type Stone = {
    id: string;
    type: string;
    size: number;
    discovered_at: string;
    name: string;
    totalElapsed?: number;
  };

  let storedStones: Stone[] = [];
  let errorMsg = '';

  async function loadStoredStones() {
    const { data, error } = await supabase
      .from('stones')
      .select('*')
      .order('discovered_at', { ascending: false });
    if (error) {
      errorMsg = error.message;
    } else {
      storedStones = data;
      // 현재 돌을 최상단에 배치합니다.
      const current = get(currentStone);
      storedStones.sort((a, b) => {
        if (a.id === current.id) return -1;
        if (b.id === current.id) return 1;
        return new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime();
      });
    }
  }

  // 불러오기(스왑) 버튼 클릭 시, 현재 돌과 저장된 돌을 서로 교환합니다.
  async function swapStone(stone: Stone) {
    const current = get(currentStone);

    // DB 업데이트: 현재 돌(ID: current.id)을 저장된 돌의 데이터로, 저장된 돌(ID: stone.id)을 현재 돌의 데이터로 변경합니다.
    const updateForCurrent = {
      type: stone.type,
      size: stone.size,
      name: stone.name,
      totalElapsed: stone.totalElapsed || 0,
      discovered_at: new Date().toISOString()
    };
    const updateForStored = {
      type: current.type,
      size: current.baseSize,
      name: current.name,
      totalElapsed: current.totalElapsed || 0,
      discovered_at: new Date().toISOString()
    };

    const { error: errorCurrent } = await supabase
      .from('stones')
      .update(updateForCurrent)
      .eq('id', current.id);
    if (errorCurrent) {
      errorMsg = errorCurrent.message;
      return;
    }

    const { error: errorStored } = await supabase
      .from('stones')
      .update(updateForStored)
      .eq('id', stone.id);
    if (errorStored) {
      errorMsg = errorStored.message;
      return;
    }

    // 클라이언트에서 현재 돌(Svelte store)을 선택한 돌로 교체합니다.
    currentStone.set({
      id: stone.id,
      type: stone.type,
      baseSize: stone.size,
      totalElapsed: stone.totalElapsed || 0,
      name: stone.name
    });
    loadStoredStones();
    goto('/');
  }

  async function deleteStone(stone: Stone) {
    const { error } = await supabase
      .from('stones')
      .delete()
      .eq('id', stone.id);
    if (error) {
      errorMsg = error.message;
    } else {
      loadStoredStones();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      goto('/');
    }
  }

  onMount(() => {
    loadStoredStones();
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div>
  <h1>Storage</h1>
  {#if errorMsg}
    <p style="color: red;">{errorMsg}</p>
  {/if}
  {#if storedStones.length === 0}
    <p>No stored stones.</p>
  {:else}
    <ul>
      {#each storedStones as stone}
        <li>
          <div class="stone-item">
            <img
              class="stone-img"
              src={`/assets/img/common/${stone.type}.png`}
              alt={stone.type}
            />
            <div class="stone-details">
              <strong>{stone.name}</strong> ({stone.type}) - Size: {stone.size.toFixed(4)} (Total Growth Time: {stone.totalElapsed || 0}s)
              <small>(Saved: {new Date(stone.discovered_at).toLocaleString()})</small>
              {#if stone.id === $currentStone.id}
                <span style="color: green; font-weight: bold;"> [Current Stone] </span>
              {/if}
            </div>
          </div>
          <div>
            {#if stone.id !== $currentStone.id}
              <button on:click={() => swapStone(stone)}>Load</button>
              <button on:click={() => deleteStone(stone)}>Throw away</button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
  <button class="back-btn" on:click={() => goto('/')}>Back</button>
</div>

<style>
  h1 {
    text-align: center;
    margin-bottom: 1rem;
  }
  ul {
    list-style: none;
    padding: 0;
  }
  li {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 1rem;
    margin-bottom: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .stone-item {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .stone-img {
    width: 50px;
    height: 50px;
    object-fit: cover;
    border-radius: 50%;
  }
  .stone-details {
    display: flex;
    flex-direction: column;
  }
  button {
    margin-right: 0.5rem;
    padding: 0.5rem 1rem;
    background: #0070f3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  button:last-child {
    background: #ff4d4d;
  }
  .back-btn {
    background: #555;
    margin-top: 1rem;
  }
</style>
