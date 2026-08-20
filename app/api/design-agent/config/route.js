import { NextResponse } from 'next/server';
import { isDesignAgentControlledExecution } from '@/src/lib/designAgentControlledMode';

export async function GET() {
  return NextResponse.json({
    controlledExecution: isDesignAgentControlledExecution(),
  });
}
