import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'حدث خطأ داخلي في الخادم';
    let errors: Record<string, string[]> | undefined;
    let conflicts: unknown[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        const rawMessage = resp.message;
        if (Array.isArray(rawMessage)) {
          errors = { validation: rawMessage as string[] };
          message = rawMessage.join('، ');
        } else if (typeof rawMessage === 'string') {
          message = rawMessage;
        }

        // ConflictException responses may contain structured conflict details.
        // Preserve them so the UI can tell the manager which trainee, trainer,
        // department, date or time caused the rejection instead of reducing the
        // response to a generic 409 message.
        if (Array.isArray(resp.conflicts)) {
          conflicts = resp.conflicts;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;

      if (exception.constructor.name === 'PrismaClientKnownRequestError') {
        const prismaError = exception as unknown as { code: string; meta?: Record<string, unknown> };
        switch (prismaError.code) {
          case 'P2002': {
            status = HttpStatus.CONFLICT;
            const target = Array.isArray(prismaError.meta?.target)
              ? (prismaError.meta?.target as string[]).join(', ')
              : String(prismaError.meta?.target || '');

            if (target.includes('email')) {
              message = 'البريد الإلكتروني مسجل بحساب آخر مسبقاً';
            } else if (target.includes('national_id') || target.includes('nationalId')) {
              message = 'رقم الهوية الوطنية مسجل لشخص آخر مسبقاً';
            } else if (target.includes('username')) {
              message = 'اسم المستخدم مسجل مسبقاً';
            } else if (target.includes('trainee_profile_id')) {
              message = 'ملف المتدرب مرتبط بسجل تدريب متعارض — جارٍ التحقق من ارتباطاته الحالية';
            } else if (target.includes('trainee_number')) {
              message = 'الرقم الأكاديمي للمتدرب مستخدم مسبقاً';
            } else if (target.includes('user_account_id') && target.includes('organization_id')) {
              message = 'حساب المتدرب مرتبط مسبقاً بهذه الجهة';
            } else {
              message = 'بيانات الحساب متعارضة مع سجل آخر موجود مسبقاً';
            }

            console.error('[Prisma P2002] unique conflict target:', target || 'unknown');
            break;
          }
          case 'P2025':
            status = HttpStatus.NOT_FOUND;
            message = 'السجل غير موجود';
            break;
          case 'P2003':
            status = HttpStatus.BAD_REQUEST;
            message = 'مرجع غير صالح — السجل المطلوب غير موجود';
            break;
          default:
            status = HttpStatus.BAD_REQUEST;
            message = 'خطأ في قاعدة البيانات';
        }
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('Exception:', exception);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...(conflicts ? { conflicts } : {}),
      errors,
      timestamp: new Date().toISOString(),
    });
  }
}
