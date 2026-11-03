import React from 'react';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import SulApp,{createAppState} from './SulApp';
import {createERPClient} from '../lib/erp-online';
vi.mock('@g4ai/ds',async original=>({...await original<typeof import('@g4ai/ds')>(),notify:vi.fn()}));
beforeEach(()=>{location.hash='#/ia';vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();location.hash='';});
it('envia ao backend, mostra resposta real e não grava chats no snapshot bloqueado',async()=>{
 const transport=vi.fn().mockResolvedValue({data:{source:'sankhya',readOnly:true,readAt:new Date().toISOString(),answer:'Vendas conferidas no ERP.',model:'gpt-5.4-mini',sources:[]},error:null}),client=createERPClient(transport),persist=vi.fn();
 render(<SulApp initialState={createAppState({})} online={client} persist={persist} onSignOut={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Total de vendas novembro'}});fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
 await screen.findByText('Vendas conferidas no ERP.');expect(transport).toHaveBeenCalledWith({operation:'sul-ai',query:{message:'Total de vendas novembro',history:[]}},expect.any(AbortSignal));expect(persist).not.toHaveBeenCalled();expect(screen.getByText('IA · gpt-5.4-mini')).toBeInTheDocument();await waitFor(()=>expect(screen.getByLabelText('Mensagem')).toHaveValue(''));
});
