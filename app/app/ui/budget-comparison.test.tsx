import assert from 'node:assert/strict';
import {test} from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {LowBidCell} from './budget-comparison';
import {addBudgetLine} from '../../lib/budget';
const pkg={id:'trade',name:'Concrete',division:'03',code:'03 30 00',owner:'Estimator',due:''};
const budget=addBudgetLine({lines:[],allowances:[],costCenters:[]},{costCenter:'Building',classification:'direct',csiCode:'03300',description:'Concrete',budget:450000},'Reviewer');
const render=(bid:any,state=budget)=>renderToStaticMarkup(<LowBidCell bid={bid} budget={state} pkg={pkg} lineId={budget.lines[0].id} onSplit={()=>{}}/>);
test('lowest-sub column distinguishes no quote from a submitted base price',()=>{
 assert.match(render(null),/No current bid/);assert.ok(!render(null).includes('$0'));
 const html=render({packageId:'trade',name:'Bidder',value:416000,basis:'base'});
 assert.match(html,/416,000/);assert.match(html,/Needs leveling/);assert.match(html,/Bidder/);
});
test('a multi-center bid asks for allocation instead of repeating the whole quote',()=>{
 const split=addBudgetLine(budget,{costCenter:'Site',classification:'direct',csiCode:'03300',description:'Concrete',budget:10000},'Reviewer');
 assert.match(render({packageId:'trade',name:'Bidder',value:416000,basis:'reviewed'},split),/Allocate/);
});
